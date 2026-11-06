import { useEffect, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button } from '~/components/ui/Button';
import type { ProjectRecord } from '~/lib/codzer/projects';
import { classNames } from '~/utils/classNames';

interface ProjectCardProps {
  project: ProjectRecord;
  opening?: boolean;
  onOpen: (project: ProjectRecord) => void;
  onRename: (project: ProjectRecord) => void;
  onDelete: (project: ProjectRecord) => void;
}

function formatDate(iso: string): string {
  if (!iso) {
    return '—';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function relativeTime(iso: string): string {
  if (!iso) {
    return 'unknown';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 30) {
    return `${days}d ago`;
  }

  return formatDate(iso);
}

export function ProjectCard({ project, opening = false, onOpen, onRename, onDelete }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Radix closes on Escape but keeps focus on the (now unmounted) trigger otherwise.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  return (
    <article
      className={classNames(
        'group relative flex flex-col rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5',
        'transition-all duration-200 hover:border-[#00E887]/50 hover:shadow-[0_0_0_1px_rgba(0,232,135,0.15),0_8px_24px_-12px_rgba(0,232,135,0.25)]',
        'focus-within:border-[#00E887]/50',
      )}
      data-testid="project-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#00E887]/30 bg-[#00E887]/10 text-[#00E887]">
          <span className="i-ph:folder-simple text-xl" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-bolt-elements-textPrimary" title={project.name}>
            {project.name}
          </h2>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-bolt-elements-textTertiary">
            {project.language && (
              <span className="rounded border border-bolt-elements-borderColor px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-bolt-elements-textSecondary">
                {project.language}
              </span>
            )}
            {typeof project.fileCount === 'number' && project.fileCount > 0 && (
              <span>
                {project.fileCount} file{project.fileCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              ref={triggerRef}
              aria-label={`Actions for ${project.name}`}
              aria-haspopup="menu"
              className={classNames(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-bolt-elements-textTertiary transition-colors',
                'hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E887]/50',
                menuOpen && 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary',
              )}
            >
              <span className="i-ph:dots-three-vertical text-base" aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              align="end"
              className={classNames(
                'z-[300] min-w-[160px] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-1 shadow-lg',
                'animate-in fade-in-0 zoom-in-95',
              )}
            >
              <DropdownMenu.Item
                role="menuitem"
                onSelect={() => {
                  setMenuOpen(false);
                  onRename(project);
                }}
                className={classNames(
                  'cursor-pointer rounded-md px-3 py-2 text-sm text-bolt-elements-textPrimary outline-none',
                  'hover:bg-bolt-elements-item-backgroundActive focus:bg-bolt-elements-item-backgroundActive',
                )}
              >
                <span className="i-ph:pencil-simple mr-2 inline-block" aria-hidden="true" />
                Rename
              </DropdownMenu.Item>

              <DropdownMenu.Item
                role="menuitem"
                onSelect={() => {
                  setMenuOpen(false);
                  onDelete(project);
                }}
                className={classNames(
                  'cursor-pointer rounded-md px-3 py-2 text-sm text-red-400 outline-none',
                  'hover:bg-red-500/10 focus:bg-red-500/10',
                )}
              >
                <span className="i-ph:trash mr-2 inline-block" aria-hidden="true" />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {project.description && (
        <p className="mt-3 line-clamp-2 text-sm text-bolt-elements-textSecondary">{project.description}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-bolt-elements-borderColor pt-3 text-xs text-bolt-elements-textTertiary">
        <div className="flex flex-col gap-0.5" title={`Created ${formatDate(project.createdAt)}`}>
          <span>Created {formatDate(project.createdAt)}</span>
          <span className="text-bolt-elements-textSecondary">Updated {relativeTime(project.updatedAt)}</span>
        </div>

        <Button
          size="sm"
          onClick={() => onOpen(project)}
          disabled={opening}
          aria-label={`Open project ${project.name}`}
          className="border border-[#00E887]/40 bg-[#00E887]/10 text-[#00E887] hover:bg-[#00E887]/20 hover:text-[#00E887] focus-visible:ring-[#00E887]/40"
        >
          {opening && <span className="i-ph:spinner-gap-bold animate-spin w-3.5 h-3.5 mr-1.5" />}
          {opening ? 'Opening…' : 'Open'}
        </Button>
      </div>
    </article>
  );
}
