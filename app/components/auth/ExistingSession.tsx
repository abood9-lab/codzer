import { useState } from 'react';
import { useNavigate } from 'react-router';
import { APP_HOME_PATH, friendlyAuthError, signOut, useAuth } from '~/lib/codzer/auth';
import { FormMessage, Spinner, TextLink } from './FormControls';

/**
 * Shown on the sign-up / log-in pages when a session already exists, so a
 * returning user can see who they are, continue, or really end the session —
 * without adding anything to the main application chrome.
 */
export function ExistingSession() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    setPending(true);
    setError(null);

    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <FormMessage tone="success">
        You are signed in as <span className="font-medium">{user.email}</span>.
      </FormMessage>

      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      <a
        href={APP_HOME_PATH}
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#0A0B0A] px-5 text-[15px] font-semibold text-[#F7F8F6] transition-colors duration-200 hover:bg-[#141715] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00E887]/35"
      >
        Continue to Codzer
      </a>

      <div className="flex items-center justify-between text-[14px]">
        <TextLink to="/forgot-password">Reset your password</TextLink>
        <button
          type="button"
          onClick={handleLogout}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-sm font-medium text-[#5C635F] transition-colors duration-200 hover:text-[#0A0B0A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E887]/50 disabled:opacity-60"
        >
          {pending ? (
            <>
              <Spinner className="h-3.5 w-3.5" />
              Logging out…
            </>
          ) : (
            'Log out'
          )}
        </button>
      </div>
    </div>
  );
}
