import { atom } from 'nanostores';
import JSZip from 'jszip';
import type { FileMap } from '~/lib/stores/files';
import { extractRelativePath } from '~/utils/diff';
import { shouldIncludeFile } from '~/utils/fileUtils';
import { getFirebaseAuth, getFirebaseFirestore, getFirebaseStorage } from './auth';

/**
 * Codzer "My Projects" — project metadata lives in Cloud Firestore under
 * users/{uid}/projects/{projectId}; the serialized workspace (a ZIP of the
 * project files) lives in Firebase Storage at
 * users/{uid}/projects/{projectId}/project.zip.
 *
 * Every operation derives the owner from the authenticated session — the uid is
 * never taken from a parameter or from the UI, so a tampered client cannot read
 * or touch another user's projects (the security rules enforce the same check
 * server-side).
 *
 * All Firebase SDK imports in this module are dynamic so SSR never loads them.
 */

export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  ownerUid: string;
  createdAt: string;
  updatedAt: string;
  storagePath?: string;
  fileCount?: number;
  language?: string;
  chatId?: string;
}

export interface ProjectInput {
  name: string;
  description?: string;
}

/** The project the current workspace will save into, if any. */
export interface ActiveProject {
  id: string;
  name: string;
}

const ACTIVE_PROJECT_KEY = 'codzer.activeProject';

function readStoredActiveProject(): ActiveProject | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.sessionStorage.getItem(ACTIVE_PROJECT_KEY);

    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as ActiveProject;

    return parsed && typeof parsed.id === 'string' && typeof parsed.name === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Session-level "current project" for the workspace. Survives a page refresh
 * (sessionStorage) so Save keeps updating the same project instead of creating
 * a duplicate. When a chat carries its own projectId in its metadata, that
 * value wins — see resolveProjectTarget().
 */
export const activeProjectStore = atom<ActiveProject | undefined>(readStoredActiveProject());

export function setActiveProject(project: ActiveProject | undefined): void {
  activeProjectStore.set(project);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (project) {
      window.sessionStorage.setItem(ACTIVE_PROJECT_KEY, JSON.stringify(project));
    } else {
      window.sessionStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
  } catch {
    /* sessionStorage may be unavailable (private mode) — the atom still works. */
  }
}

/** Owner uid from the live Firebase session. Throws when signed out. */
async function requireOwnerUid(): Promise<string> {
  const auth = await getFirebaseAuth();
  await auth.authStateReady();

  const user = auth.currentUser;

  if (!user) {
    throw Object.assign(new Error('Sign in to save and manage your projects.'), { code: 'auth/not-signed-in' });
  }

  return user.uid;
}

export function projectStoragePath(ownerUid: string, projectId: string): string {
  return `users/${ownerUid}/projects/${projectId}/project.zip`;
}

/** Validates a project name; returns an error message or undefined when valid. */
export function validateProjectName(name: string): string | undefined {
  const trimmed = name.trim();

  if (!trimmed) {
    return 'Enter a project name.';
  }

  if (trimmed.length > 80) {
    return 'Project names must be 80 characters or fewer.';
  }

  return undefined;
}

function normalizeInput(input: ProjectInput): { name: string; description: string | undefined } {
  const name = input.name.trim();
  const description = input.description?.trim();

  return {
    name,
    description: description ? description.slice(0, 2000) : undefined,
  };
}

function toProjectRecord(id: string, data: Record<string, unknown>): ProjectRecord {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Untitled project',
    description: typeof data.description === 'string' ? data.description : undefined,
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    storagePath: typeof data.storagePath === 'string' ? data.storagePath : undefined,
    fileCount: typeof data.fileCount === 'number' ? data.fileCount : undefined,
    language: typeof data.language === 'string' ? data.language : undefined,
    chatId: typeof data.chatId === 'string' ? data.chatId : undefined,
  };
}

/** Lists the signed-in user's projects, most recently updated first. */
export async function listProjects(): Promise<ProjectRecord[]> {
  const ownerUid = await requireOwnerUid();
  const firestore = await getFirebaseFirestore();
  const { collection, getDocs, orderBy, query } = await import('firebase/firestore');

  const snapshot = await getDocs(query(collection(firestore, 'users', ownerUid, 'projects'), orderBy('updatedAt', 'desc')));

  return snapshot.docs.map((docSnapshot) => toProjectRecord(docSnapshot.id, docSnapshot.data()));
}

/** Creates a project document under the authenticated user. */
export async function createProject(input: ProjectInput): Promise<ProjectRecord> {
  const ownerUid = await requireOwnerUid();
  const { name, description } = normalizeInput(input);

  const nameError = validateProjectName(name);

  if (nameError) {
    throw Object.assign(new Error(nameError), { code: 'codzer/invalid-name' });
  }

  const firestore = await getFirebaseFirestore();
  const { collection, addDoc } = await import('firebase/firestore');
  const now = new Date().toISOString();

  const document: Record<string, unknown> = {
    name,
    ownerUid,
    createdAt: now,
    updatedAt: now,
    storagePath: null,
    fileCount: 0,
  };

  // Firestore rejects `undefined` field values — only send a real string.
  if (description) {
    document.description = description;
  }

  const reference = await addDoc(collection(firestore, 'users', ownerUid, 'projects'), document);

  return {
    id: reference.id,
    name,
    description,
    ownerUid,
    createdAt: now,
    updatedAt: now,
    fileCount: 0,
  };
}

/** Renames a project. Files in Storage are untouched. */
export async function renameProject(projectId: string, name: string): Promise<void> {
  const ownerUid = await requireOwnerUid();

  const trimmed = name.trim();
  const nameError = validateProjectName(trimmed);

  if (nameError) {
    throw Object.assign(new Error(nameError), { code: 'codzer/invalid-name' });
  }

  const firestore = await getFirebaseFirestore();
  const { doc, updateDoc } = await import('firebase/firestore');

  await updateDoc(doc(firestore, 'users', ownerUid, 'projects', projectId), {
    name: trimmed,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Deletes a project's stored archive first, then its metadata document.
 *
 * Order matters for partial failures: while the document still exists a retry
 * keeps pointing at the same files, and deleting an already-removed object is
 * tolerated. If the file delete fails (e.g. missing Storage permissions) the
 * metadata is left untouched, so nothing reports success while files remain.
 */
export async function deleteProject(project: ProjectRecord): Promise<void> {
  const ownerUid = await requireOwnerUid();
  const storage = await getFirebaseStorage();
  const { ref, deleteObject } = await import('firebase/storage');

  if (project.storagePath) {
    try {
      await deleteObject(ref(storage, project.storagePath));
    } catch (error) {
      const code = (error as { code?: string }).code;

      if (code !== 'storage/object-not-found') {
        throw error;
      }
    }
  }

  const firestore = await getFirebaseFirestore();
  const { doc, deleteDoc } = await import('firebase/firestore');

  await deleteDoc(doc(firestore, 'users', ownerUid, 'projects', project.id));
}

/** Uploads the project archive and upserts its Firestore metadata. */
export async function saveProjectArchive(
  projectId: string,
  archive: Blob,
  details: { fileCount: number; language?: string; name?: string; description?: string },
): Promise<ProjectRecord> {
  const ownerUid = await requireOwnerUid();
  const storage = await getFirebaseStorage();
  const storagePath = projectStoragePath(ownerUid, projectId);
  const { ref, uploadBytes } = await import('firebase/storage');

  await uploadBytes(ref(storage, storagePath), archive, { contentType: 'application/zip' });

  const firestore = await getFirebaseFirestore();
  const { doc, setDoc } = await import('firebase/firestore');
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    ownerUid,
    storagePath,
    updatedAt: now,
    fileCount: details.fileCount,
  };

  if (details.language) {
    patch.language = details.language;
  }

  if (details.name !== undefined) {
    patch.name = details.name;
  }

  if (details.description !== undefined) {
    patch.description = details.description;
  }

  await setDoc(doc(firestore, 'users', ownerUid, 'projects', projectId), patch, { merge: true });

  const record: ProjectRecord = {
    id: projectId,
    name: details.name ?? '',
    description: details.description,
    ownerUid,
    createdAt: '',
    updatedAt: now,
    storagePath,
    fileCount: details.fileCount,
    language: details.language,
  };

  return record;
}

/** Downloads the stored project archive for a project. */
export async function fetchProjectArchive(project: ProjectRecord): Promise<Blob> {
  const ownerUid = await requireOwnerUid();
  const storage = await getFirebaseStorage();
  const { ref, getBytes } = await import('firebase/storage');

  const storagePath = project.storagePath || projectStoragePath(ownerUid, project.id);
  const bytes = await getBytes(ref(storage, storagePath));

  return new Blob([bytes], { type: 'application/zip' });
}

/**
 * Zips the current workspace files, preserving nested directories.
 *
 * Text files are stored verbatim; binary files are stored from their base64
 * representation (the format FilesStore keeps). The same ignore rules the ZIP
 * import applies are applied here so a save/open round trip is symmetric.
 */
export async function buildProjectArchive(files: FileMap): Promise<{ archive: Blob; fileCount: number }> {
  const zip = new JSZip();

  let fileCount = 0;

  for (const [filePath, dirent] of Object.entries(files)) {
    if (dirent?.type !== 'file') {
      continue;
    }

    const relativePath = extractRelativePath(filePath);

    if (!relativePath || relativePath.startsWith('..') || relativePath.startsWith('/')) {
      continue;
    }

    if (!shouldIncludeFile(relativePath)) {
      continue;
    }

    if (dirent.isBinary) {
      zip.file(relativePath, dirent.content, { base64: true });
    } else {
      zip.file(relativePath, dirent.content);
    }

    fileCount++;
  }

  const archive = await zip.generateAsync({ type: 'blob' });

  return { archive, fileCount };
}

/** Best-effort project language/framework label from the workspace files. */
export function detectProjectLanguage(files: FileMap): string | undefined {
  const entries = Object.entries(files);

  const packageJson = entries
    .find(([filePath, dirent]) => dirent?.type === 'file' && /(^|\/)package\.json$/.test(extractRelativePath(filePath)))
    ?.[1];

  if (packageJson?.type === 'file' && !packageJson.isBinary) {
    try {
      const parsed = JSON.parse(packageJson.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = { ...parsed.dependencies, ...parsed.devDependencies };

      if (deps.next) {
        return 'Next.js';
      }

      if (deps['react-native'] || deps.expo) {
        return 'React Native';
      }

      if (deps.react) {
        return 'React';
      }

      if (deps.nuxt) {
        return 'Nuxt';
      }

      if (deps.vue) {
        return 'Vue';
      }

      if (deps.svelte || deps['@sveltejs/kit']) {
        return 'Svelte';
      }

      if (deps.astro) {
        return 'Astro';
      }

      if (deps.express || deps.fastify || deps.koa) {
        return 'Node.js';
      }
    } catch {
      /* Unparseable package.json — fall through to extension detection. */
    }
  }

  const has = (extension: string) => entries.some(([filePath, dirent]) => dirent?.type === 'file' && extractRelativePath(filePath).endsWith(extension));

  if (has('.tsx') || has('.ts')) {
    return 'TypeScript';
  }

  if (has('.py')) {
    return 'Python';
  }

  if (has('.go')) {
    return 'Go';
  }

  if (has('.jsx') || has('.js')) {
    return 'JavaScript';
  }

  return undefined;
}

/**
 * Resolves which project the current workspace should save into:
 * the projectId stored in the chat's metadata (survives refresh and reopens),
 * falling back to the session's active project.
 */
export async function resolveProjectTarget(): Promise<ActiveProject | undefined> {
  try {
    const { chatMetadata } = await import('~/lib/persistence');
    const projectId = chatMetadata.get()?.projectId;
    const stored = activeProjectStore.get();

    if (projectId) {
      // The chat owns the link; keep the session name only when ids match.
      return { id: projectId, name: stored?.id === projectId ? stored.name : '' };
    }
  } catch {
    /* Persistence unavailable — fall through to the session value. */
  }

  return activeProjectStore.get();
}

/** Maps Firebase/Firestore/Storage failures to copy a user can act on. */
export function friendlyProjectError(error: unknown): string {
  const { code, message } = error as { code?: string; message?: string };
  const detail = typeof message === 'string' ? message : '';

  if (!code && !message) {
    return 'Could not reach Codzer. Check your connection and try again.';
  }

  /*
   * Setup problems carry an actionable message instead of a generic failure:
   * the SDK reports disabled APIs and missing buckets as plain messages, so
   * match on them to tell the user the exact console step needed.
   */
  if (/firestore api has not been used|firestore api.*disabled|enable it by visiting/i.test(detail)) {
    return 'Cloud Firestore is switched off for this Firebase project. In the Google Cloud console, open APIs & Services → APIs → Cloud Firestore API and click Enable, then create the database in the Firebase console.';
  }

  if (/bucket.*(not found|does not exist)|storage\/bucket-not-found|no default bucket/i.test(detail) || code === 'storage/bucket-not-found') {
    return 'Firebase Storage has no storage bucket for this project yet. In the Firebase console, open Storage and create a bucket (e.g. codzer.firebasestorage.app), then try again.';
  }

  if (/quota|rate limit/i.test(detail) && !code) {
    return 'Firebase quota exceeded. Please wait a moment and try again.';
  }

  switch (code) {
    case 'auth/not-signed-in':
      return 'Sign in to save your projects to the cloud.';
    case 'permission-denied':
      return 'You do not have permission to access this project. Check the Firestore security rules for your Firebase project.';
    case 'failed-precondition':
      return 'Cloud Firestore is not set up for this Firebase project yet. Create a Firestore database in the Firebase console.';
    case 'unavailable':
      return 'Cloud Firestore is unreachable right now. Check your connection and try again.';
    case 'resource-exhausted':
      return 'Firebase quota exceeded. Please wait a moment and try again.';
    case 'storage/unknown':
    case 'storage/retry-limit-exceeded':
      return 'The file upload could not be completed. Check your connection and try again.';
    case 'storage/unauthorized':
      return 'Storage denied the upload. Check the Firebase Storage security rules for your Firebase project.';
    case 'storage/invalid-checksum':
      return 'The upload was corrupted in transit. Please try saving again.';
    case 'codzer/invalid-name':
      return message ?? 'Enter a valid project name.';
    default:
      if (message) {
        return message;
      }

      return 'Something went wrong. Please try again.';
  }
}
