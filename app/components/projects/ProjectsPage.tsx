import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { ProjectCard } from './ProjectCard';
import { ProjectFormDialog, type ProjectFormMode } from './ProjectFormDialog';
import { Button } from '~/components/ui/Button';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import { refreshAuth, useAuth } from '~/lib/codzer/auth';
import {
  activeProjectStore,
  createProject,
  deleteProject,
  fetchProjectArchive,
  friendlyProjectError,
  listProjects,
  renameProject,
  setActiveProject,
  type ProjectRecord,
} from '~/lib/codzer/projects';

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; projects: ProjectRecord[] }
  | { status: 'error'; message: string };

export function ProjectsPage() {
  const navigate = useNavigate();
  const auth = useAuth();

  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [formMode, setFormMode] = useState<ProjectFormMode | null>(null);
  const [formProject, setFormProject] = useState<ProjectRecord | undefined>(undefined);
  const [formPending, setFormPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | undefined>(undefined);
  const [deletePending, setDeletePending] = useState(false);
  const [openingId, setOpeningId] = useState<string | undefined>(undefined);

  const signedIn = auth.status === 'authenticated';

  const load = useCallback(async () => {
    setListState({ status: 'loading' });

    try {
      const projects = await listProjects();
      setListState({ status: 'ready', projects });
    } catch (error) {
      setListState({ status: 'error', message: friendlyProjectError(error) });
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, []);

  useEffect(() => {
    if (auth.status === 'authenticated') {
      void load();
    } else if (auth.status === 'anonymous') {
      setListState({ status: 'ready', projects: [] });
    }
  }, [auth.status, load]);

  const handleCreate = async (values: { name: string; description?: string }) => {
    setFormPending(true);
    setFormError(null);

    try {
      const project = await createProject(values);

      /*
       * The workspace opens on the home route, and the active project makes the
       * workbench Save button target this new project straight away.
       */
      setActiveProject({ id: project.id, name: project.name });
      setFormMode(null);
      toast.success(`Project "${project.name}" created`);
      navigate('/');
    } catch (error) {
      setFormError(friendlyProjectError(error));
    } finally {
      setFormPending(false);
    }
  };

  const handleRename = async (values: { name: string }) => {
    const target = formProject;

    if (!target) {
      return;
    }

    setFormPending(true);
    setFormError(null);

    try {
      await renameProject(target.id, values.name);

      const active = activeProjectStore.get();

      if (active?.id === target.id) {
        setActiveProject({ id: target.id, name: values.name });
      }

      setFormMode(null);
      toast.success('Project renamed');
      await load();
    } catch (error) {
      setFormError(friendlyProjectError(error));
    } finally {
      setFormPending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeletePending(true);

    try {
      await deleteProject(deleteTarget);

      const active = activeProjectStore.get();

      if (active?.id === deleteTarget.id) {
        setActiveProject(undefined);
      }

      setDeleteTarget(undefined);
      toast.success(`Project "${deleteTarget.name}" deleted`);
      await load();
    } catch (error) {
      setDeleteTarget(undefined);
      toast.error(friendlyProjectError(error));
    } finally {
      setDeletePending(false);
    }
  };

  const handleOpen = async (project: ProjectRecord) => {
    if (!project.storagePath) {
      toast.info(`"${project.name}" has no saved files yet. Open its workspace and press Save first.`);

      return;
    }

    setOpeningId(project.id);

    try {
      const archive = await fetchProjectArchive(project);
      const zipFile = new File([archive], `${project.name}.zip`, { type: 'application/zip' });

      const { createChatFromZip } = await import('~/utils/zipImport');
      const result = await createChatFromZip(zipFile);

      const { db } = await import('~/lib/persistence');
      const { createChatFromMessages } = await import('~/lib/persistence/db');

      if (!db) {
        throw Object.assign(new Error('Local chat storage is unavailable in this browser.'), {
          code: 'persistence/unavailable',
        });
      }

      /*
       * Reuses bolt.diy's own ZIP import path: the archive becomes a chat whose
       * file actions replay into the WebContainer, restoring the workspace
       * exactly like importing a project ZIP does today.
       */
      const chatId = await createChatFromMessages(db, project.name, result.messages, { projectId: project.id });

      setActiveProject({ id: project.id, name: project.name });
      navigate(`/chat/${chatId}`);
      toast.success(`Opened "${project.name}"`);
    } catch (error) {
      toast.error(friendlyProjectError(error));
    } finally {
      setOpeningId(undefined);
    }
  };

  return (
    <div className="relative z-10 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page heading */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-bolt-elements-textPrimary">My Projects</h1>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">
              Your saved Codzer workspaces — create, reopen, rename and manage them in one place.
            </p>
          </div>

          <Button
            onClick={() => {
              setFormProject(undefined);
              setFormError(null);
              setFormMode('create');
            }}
            disabled={!signedIn}
            className="h-10 shrink-0 bg-[#00E887] px-4 text-sm font-semibold text-[#04140D] hover:bg-[#00D77D] focus-visible:ring-4 focus-visible:ring-[#00E887]/40"
          >
            <span className="i-ph:plus mr-1.5 text-base" aria-hidden="true" />
            New Project
          </Button>
        </div>

        <div className="mt-6">
          {/* Signed out */}
          {auth.status === 'anonymous' && (
            <EmptyState
              icon="i-ph:lock-key"
              title="Sign in to see your projects"
              description="Projects are stored privately in your Codzer account. Sign in to create, save and reopen them."
              actionLabel="Sign in"
              onAction={() => navigate('/login')}
            />
          )}

          {/* Auth still resolving */}
          {auth.status === 'loading' && <ProjectsSkeleton />}

          {signedIn && (
            <>
              {/* Loading */}
              {listState.status === 'loading' && <ProjectsSkeleton />}

              {/* Error */}
              {listState.status === 'error' && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center"
                >
                  <span className="i-ph:warning-circle text-2xl text-red-400" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium text-bolt-elements-textPrimary">Could not load your projects</p>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">{listState.message}</p>
                  <Button variant="outline" className="mt-4" onClick={() => void load()}>
                    <span className="i-ph:arrows-clockwise mr-1.5" aria-hidden="true" />
                    Try again
                  </Button>
                </div>
              )}

              {/* Empty */}
              {listState.status === 'ready' && listState.projects.length === 0 && (
                <EmptyState
                  icon="i-ph:folder-plus"
                  title="No projects yet"
                  description="Create your first project, build something in the workspace, then press Save to keep it in the cloud."
                  actionLabel="Create your first project"
                  onAction={() => {
                    setFormProject(undefined);
                    setFormError(null);
                    setFormMode('create');
                  }}
                />
              )}

              {/* Grid */}
              {listState.status === 'ready' && listState.projects.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {listState.projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      opening={openingId === project.id}
                      onOpen={(target) => void handleOpen(target)}
                      onRename={(target) => {
                        setFormProject(target);
                        setFormError(null);
                        setFormMode('rename');
                      }}
                      onDelete={(target) => setDeleteTarget(target)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ProjectFormDialog
        open={formMode !== null}
        mode={formMode ?? 'create'}
        initialName={formProject?.name ?? ''}
        initialDescription={formProject?.description ?? ''}
        pending={formPending}
        error={formError}
        onClose={() => {
          setFormMode(null);
          setFormProject(undefined);
          setFormError(null);
        }}
        onSubmit={(values) => void (formMode === 'rename' ? handleRename(values) : handleCreate(values))}
      />

      <ConfirmationDialog
        isOpen={deleteTarget !== undefined}
        onClose={() => !deletePending && setDeleteTarget(undefined)}
        onConfirm={() => void handleDelete()}
        title="Delete project?"
        description={`"${deleteTarget?.name ?? ''}" and its saved files will be permanently removed. This cannot be undone.`}
        confirmLabel={deletePending ? 'Deleting…' : 'Delete project'}
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={deletePending}
      />
    </div>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true" data-testid="projects-skeleton">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-bolt-elements-background-depth-3" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-bolt-elements-background-depth-3" />
              <div className="h-3 w-1/3 rounded bg-bolt-elements-background-depth-3" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-bolt-elements-background-depth-3" />
            <div className="h-3 w-4/5 rounded bg-bolt-elements-background-depth-3" />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-bolt-elements-borderColor pt-3">
            <div className="h-3 w-24 rounded bg-bolt-elements-background-depth-3" />
            <div className="h-8 w-16 rounded-md bg-bolt-elements-background-depth-3" />
          </div>
        </div>
      ))}
    </div>
  );
}
