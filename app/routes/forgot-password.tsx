import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { MetaFunction } from 'react-router';
import { AuthShell } from '~/components/auth/AuthShell';
import { Field, FormMessage, SubmitButton, TextLink } from '~/components/auth/FormControls';
import { friendlyAuthError, sendRecoveryEmail } from '~/lib/codzer/auth';

export const meta: MetaFunction = () => [
  { title: 'Reset password · Codzer' },
  { name: 'description', content: 'Request a password recovery link for your Codzer account.' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Mounting this page is itself the recovery action's context; nothing else
    // to restore, but the session check keeps the header state honest.
    void Promise.resolve();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (pending) {
      return;
    }

    const trimmed = email.trim();

    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError('Enter a valid email address.');
      setFormError(null);
      return;
    }

    setEmailError(undefined);
    setFormError(null);
    setPending(true);

    try {
      await sendRecoveryEmail(trimmed);
      // Only shown when Firebase actually accepted the request.
      setSentTo(trimmed);
    } catch (caught) {
      setSentTo(null);
      setFormError(friendlyAuthError(caught));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell
      heading="Reset your password"
      lede="Enter your email and we'll send you a recovery link."
      footer={
        <>
          Remembered it? <TextLink to="/login">Back to log in</TextLink>
        </>
      }
    >
      {sentTo ? (
        <div className="space-y-5">
          <FormMessage tone="success">
            Recovery link sent to <span className="font-medium">{sentTo}</span>. Open it within the hour to choose a
            new password.
          </FormMessage>

          <div className="flex flex-wrap items-center justify-between gap-3 text-[14.5px]">
            <TextLink to="/login">Back to log in</TextLink>
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="rounded-sm font-medium text-[#5C635F] transition-colors duration-200 hover:text-[#0A0B0A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E887]/50"
            >
              Use a different email
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {formError ? (
            <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
              <FormMessage tone="error">{formError}</FormMessage>
            </div>
          ) : null}

          <Field
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(undefined);
            }}
            error={emailError}
            required
          />

          <SubmitButton pending={pending} pendingLabel="Sending link…">
            Send recovery email
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
