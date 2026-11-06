import { useStore } from '@nanostores/react';
import { Link, useLocation } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header
      className={classNames('flex items-center px-4 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-bolt-elements-borderColor': chat.started,
      })}
    >
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary cursor-pointer">
        <div className="i-ph:sidebar-simple-duotone text-xl" />
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          {/* <span className="i-bolt:logo-text?mask w-[46px] inline-block" /> */}
          <img src="/logo-light-styled.png" alt="logo" className="w-[90px] inline-block dark:hidden" />
          <img src="/logo-dark-styled.png" alt="logo" className="w-[90px] inline-block hidden dark:block" />
        </a>
        <ProjectsNavLink />
      </div>
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      )}
    </header>
  );
}

function ProjectsNavLink() {
  const location = useLocation();
  const isActive = location.pathname === '/projects';

  return (
    <Link
      to="/projects"
      aria-current={isActive ? 'page' : undefined}
      className={classNames(
        'ml-3 hidden items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors sm:inline-flex',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E887]/50',
        isActive
          ? 'border-[#00E887]/50 bg-[#00E887]/15 text-[#00E887]'
          : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:border-[#00E887]/40 hover:text-[#00E887]',
      )}
    >
      <span className="i-ph:folder-simple text-sm" aria-hidden="true" />
      My Projects
    </Link>
  );
}
