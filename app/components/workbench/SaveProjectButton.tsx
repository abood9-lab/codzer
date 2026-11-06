import { useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { ProjectFormDialog } from '~/components/projects/ProjectFormDialog';
import { Button } from '~/components/ui/Button';
import {
  activeProjectStore,
  buildProjectArchive,
  createProject,
  detectProjectLanguage,
  friendlyProjectError,
  resolveProjectTarget,
  saveProjectArchive,
  setActiveProject,
} from '~/lib/codzer/projects';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

interface PreparedArchive {
  archive: Blob;
  fileCount: number;
  language?: string;
}

/**
 * "Save" for the current workspace.
 *
 * 1. Flushes unsaved editor buffers so the archive matches what is on screen.
 * 2. Zips the workbench files (nested paths preserved, same ignore rules as
 *    the ZIP import) and uploads the archive to Firebase Storage.
 * 3. Upserts the project's Firestore metadata and links the current chat to
 *    the project via chatMetadata.projectId, so later saves land on the same
 *    project without asking again.
 *
 * Saving is always manual — nothing uploads in the background.
 */
export function SaveProjectButton() {
  const activeProject = useStore(activeProjectStore);
  const [saving, setSaving] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsPending, setSaveAsPending] = useState(false);
  const [saveAsError, setSaveAsError] = useState<string | null>(null);
  const preparedArchive = useRef<PreparedArchive | null>(null);

  const prepareArchive = async (): Promise<PreparedArchive> => {
    await workbenchStore.saveAllFiles();

    const files = workbenchStore.files.get();
    const { archive, fileCount } = await buildProjectArchive(files);

    if (!fileCount) {
      throw Object.assign(new Error('This workspace has no files to save yet. Ask Bolt to build something first.'), {
        code: 'codzer/empty-workspace',
      });
    }

    return { archive, fileCount, language: detectProjectLanguage(files) };
  };

  /** Links the open chat to the project so future saves target it directly. */
  const linkCurrentChat = async (projectId: string): Promise<void> => {
    try {
      const { chatId, chatMetadata, db, updateChatMetadata } = await import('~/lib/persistence');
      const nextMetadata = { ...chatMetadata.get(), projectId };

      // Wins even before the chat row exists — creation reuses the atom.
      chatMetadata.set(nextMetadata);

      const currentChatId = chatId.get();

      if (db && currentChatId) {
        await updateChatMetadata(db, currentChatId, nextMetadata);
      }
    } catch (error) {
      // The cloud save already succeeded; the link retries on the next save.
      console.error('Failed to link the chat to this project:', error);
    }
  };

  const completeSave = async (target: { id: string; name: string }, data: PreparedArchive): Promise<void> => {
    await saveProjectArchive(target.id, data.archive, {
      fileCount: data.fileCount,
      language: data.language,
    });

    setActiveProject(target);
    await linkCurrentChat(target.id);

    const fileLabel = `${data.fileCount} file${data.fileCount === 1 ? '' : 's'}`;
    toast.success(`Project "${target.name}" saved to the cloud (${fileLabel}).`);
  };

  const handleSave = async (): Promise<void> => {
    if (saving || saveAsPending) {
      return;
    }

    setSaving(true);
    setSaveAsError(null);

    try {
      const data = await prepareArchive();
      const target = await resolveProjectTarget();

      if (!target?.id) {
        // First save for this workspace: ask where it should live.
        const { description } = await import('~/lib/persistence');

        preparedArchive.current = data;
        setSaveAsName(description.get()?.trim() || '');
        setSaveAsOpen(true);

        return;
      }

      await completeSave(target, data);
    } catch (error) {
      toast.error(friendlyProjectError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAs = async (values: { name: string; description?: string }): Promise<void> => {
    if (saveAsPending) {
      return;
    }

    setSaveAsPending(true);
    setSaveAsError(null);

    try {
      const data = preparedArchive.current ?? (await prepareArchive());
      const project = await createProject(values);

      await completeSave({ id: project.id, name: project.name }, data);

      preparedArchive.current = null;
      setSaveAsOpen(false);
    } catch (error) {
      setSaveAsError(friendlyProjectError(error));
    } finally {
      setSaveAsPending(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => void handleSave()}
        disabled={saving || saveAsPending}
        data-testid="save-project-button"
        title={activeProject ? `Save the workspace to "${activeProject.name}"` : 'Save the workspace as a cloud project'}
        className={classNames(
          'mr-1 gap-1.5 border border-[#00E887]/40 bg-[#00E887]/10 text-[#00E887]',
          'hover:bg-[#00E887]/20 hover:text-[#00E887] focus-visible:ring-1 focus-visible:ring-[#00E887]/50',
          'data-[state=open]:bg-[#00E887]/20',
        )}
      >
        {saving ? (
          <span className="i-ph:spinner-gap-bold animate-spin size-3.5" aria-hidden="true" />
        ) : (
          <span className="i-ph:cloud-arrow-up size-3.5" aria-hidden="true" />
        )}
        {saving ? 'Saving…' : activeProject ? `Save · ${activeProject.name}` : 'Save project'}
      </Button>

      <ProjectFormDialog
        open={saveAsOpen}
        mode="saveAs"
        initialName={saveAsName}
        pending={saveAsPending}
        error={saveAsError}
        onClose={() => {
          if (!saveAsPending) {
            setSaveAsOpen(false);
            setSaveAsError(null);
            preparedArchive.current = null;
          }
        }}
        onSubmit={(values) => void handleSaveAs(values)}
      />
    </>
  );
}
