import { useEffect, useId, useState } from 'react';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { validateProjectName } from '~/lib/codzer/projects';

export type ProjectFormMode = 'create' | 'rename' | 'saveAs';

interface ProjectFormDialogProps {
  open: boolean;
  mode: ProjectFormMode;
  initialName?: string;
  initialDescription?: string;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string; description?: string }) => void;
}

const COPY: Record<ProjectFormMode, { title: string; lede: string; submit: string }> = {
  create: {
    title: 'New project',
    lede: 'Create an empty project in your Codzer workspace. You can save its files to the cloud from the editor.',
    submit: 'Create project',
  },
  rename: {
    title: 'Rename project',
    lede: 'Only the project name changes — its saved files stay exactly as they are.',
    submit: 'Save name',
  },
  saveAs: {
    title: 'Save project to the cloud',
    lede: 'Give the current workspace a home so you can reopen it from My Projects on any device.',
    submit: 'Save project',
  },
};

export function ProjectFormDialog({
  open,
  mode,
  initialName = '',
  initialDescription = '',
  pending = false,
  error,
  onClose,
  onSubmit,
}: ProjectFormDialogProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const nameId = useId();
  const descriptionId = useId();

  const copy = COPY[mode];

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(initialName);
    setDescription(initialDescription);
    setNameError(undefined);
  }, [open, initialName, initialDescription]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (pending) {
      return;
    }

    const validationError = validateProjectName(name);

    if (validationError) {
      setNameError(validationError);

      return;
    }

    setNameError(undefined);
    onSubmit({ name: name.trim(), description: mode === 'rename' ? undefined : description.trim() || undefined });
  };

  return (
    <DialogRoot open={open} onOpenChange={(nextOpen) => !nextOpen && !pending && onClose()}>
      <Dialog className="w-[min(480px,calc(100vw-2rem))] p-6" onClose={onClose} onBackdrop={onClose}>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription className="mb-5">{copy.lede}</DialogDescription>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor={nameId} className="text-bolt-elements-textPrimary">
              Project name
            </Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => {
                setName(event.target.value);

                if (nameError) {
                  setNameError(undefined);
                }
              }}
              placeholder="My awesome app"
              maxLength={80}
              autoFocus
              disabled={pending}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? `${nameId}-error` : undefined}
              className="border-bolt-elements-border focus-visible:ring-[#00E887]/40 focus-visible:border-[#00E887]"
            />

            {nameError && (
              <p id={`${nameId}-error`} role="alert" className="text-xs text-red-400 pt-1">
                {nameError}
              </p>
            )}
          </div>

          {mode !== 'rename' && (
            <div className="space-y-1.5">
              <Label htmlFor={descriptionId} className="text-bolt-elements-textPrimary">
                Description <span className="text-bolt-elements-textTertiary font-normal">(optional)</span>
              </Label>
              <textarea
                id={descriptionId}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What does this project do?"
                rows={3}
                maxLength={2000}
                disabled={pending}
                className="flex w-full rounded-md border border-bolt-elements-border bg-bolt-elements-background px-3 py-2 text-sm ring-offset-bolt-elements-background placeholder:text-bolt-elements-textSecondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-[#00E887] text-[#04140D] font-semibold hover:bg-[#00D77D] focus-visible:ring-[#00E887]/40"
            >
              {pending && <span className="i-ph:spinner-gap-bold animate-spin w-4 h-4 mr-1.5" />}
              {copy.submit}
            </Button>
          </div>
        </form>
      </Dialog>
    </DialogRoot>
  );
}
