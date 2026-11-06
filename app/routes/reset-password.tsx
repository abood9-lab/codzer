import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { MetaFunction } from 'react-router';
import { useSearchParams } from 'react-router';
import { AuthShell } from '~/components/auth/AuthShell';
import {
  FormMessage,
  PasswordField,
  PasswordRequirements,
  SubmitButton,
  TextLink,
} from '~/components/auth/FormControls';
import { friendlyAuthError, resetPassword } from '~/lib/codzer/auth';

export const meta: MetaFunction = () => [
  { title: 'Choose a new password · Codzer' },
  { name: 'description', content: 'Set a new password for your Codzer account.' },
];

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  // Firebase recovery links carry a single `oobCode` parameter.
  const oobCode = searchParams.get('oobCode') ?? '';

  const [values, setValues] = useState({ password: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const errorRef = useRef<HTMLDivElement>(null);
  const linkValid = Boolean(oobCode);

  useEffect(() => {
    // Nothing to hydrate: the one-time secret arrives in this URL only.
  }, []);

  const set = (name: 'password' | 'confirm') => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (pending || !linkValid) {
      return;
    }

    const errors: { password?: string; confirm?: string } = {};

    if (values.password.length < 8) {
      errors.password = 'Use at least 8 characters.';
    }

    if (values.confirm !== values.password) {
      errors.confirm = 'Passwords do not match.';
    }

    setFieldErrors(errors);
    setFormError(null);

    if (errors.password || errors.confirm) {
      return;
    }

    setPending(true);

    try {
      await resetPassword({ oobCode, password: values.password });
      setDone(true);
    } catch (caught) {
      setFormError(friendlyAuthError(caught));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  };

  if (!linkValid) {
    return (
      <AuthShell heading="Choose a new password" lede="Set a new password for your Codzer account.">
        <div className="space-y-5">
          <FormMessage tone="error">
            This reset link is incomplete. Open the newest email from Firebase, or request a fresh link.
          </FormMessage>
          <TextLink to="/forgot-password">Request a new recovery link</TextLink>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell heading="Choose a new password" lede="Set a new password for your Codzer account.">
        <div className="space-y-5">
          <FormMessage tone="success">Password updated. You can now sign in with your new password.</FormMessage>
          <TextLink to="/login">Continue to log in →</TextLink>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Choose a new password"
      lede="Set a new password for your Codzer account."
      footer={
        <>
          Changed your mind? <TextLink to="/login">Back to log in</TextLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError ? (
          <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
            <FormMessage tone="error">{formError}</FormMessage>
          </div>
        ) : null}

        <div>
          <PasswordField
            label="New password"
            name="password"
            autoComplete="new-password"
            autoFocus
            placeholder="At least 8 characters"
            value={values.password}
            onChange={set('password')}
            error={fieldErrors.password}
            required
          />
          <PasswordRequirements value={values.password} />
        </div>

        <PasswordField
          label="Confirm new password"
          name="confirm"
          autoComplete="new-password"
          placeholder="Repeat your new password"
          value={values.confirm}
          onChange={set('confirm')}
          error={fieldErrors.confirm}
          required
        />

        <SubmitButton pending={pending} pendingLabel="Updating password…">
          Update password
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
