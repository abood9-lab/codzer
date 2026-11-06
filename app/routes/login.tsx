import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { MetaFunction } from 'react-router';
import { useNavigate } from 'react-router';
import { AuthShell } from '~/components/auth/AuthShell';
import { ExistingSession } from '~/components/auth/ExistingSession';
import { Field, FormMessage, PasswordField, SubmitButton, TextLink } from '~/components/auth/FormControls';
import { APP_HOME_PATH, friendlyAuthError, refreshAuth, signIn, useAuth } from '~/lib/codzer/auth';

export const meta: MetaFunction = () => [
  { title: 'Log in · Codzer' },
  { name: 'description', content: 'Sign in to Codzer and continue building with AI.' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const navigate = useNavigate();
  const { status } = useAuth();

  const [values, setValues] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshAuth();
  }, []);

  const set = (name: 'email' | 'password') => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (pending) {
      return;
    }

    const errors: { email?: string; password?: string } = {};

    if (!EMAIL_PATTERN.test(values.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }

    if (!values.password) {
      errors.password = 'Enter your password.';
    }

    setFieldErrors(errors);
    setFormError(null);

    if (errors.email || errors.password) {
      return;
    }

    setPending(true);

    try {
      await signIn(values.email.trim(), values.password);
      navigate(APP_HOME_PATH, { replace: true });
    } catch (caught) {
      setFormError(friendlyAuthError(caught));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell
      heading="Welcome back"
      lede="Sign in to continue building with Codzer."
      footer={
        <>
          New to Codzer? <TextLink to="/signup">Create an account</TextLink>
        </>
      }
    >
      {status === 'authenticated' ? (
        <ExistingSession />
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
            value={values.email}
            onChange={set('email')}
            error={fieldErrors.email}
            required
          />

          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={values.password}
            onChange={set('password')}
            error={fieldErrors.password}
            required
          />

          <div className="flex justify-end">
            <TextLink to="/forgot-password" className="text-[14px] text-[#5C635F] hover:text-[#0A0B0A]">
              Forgot password?
            </TextLink>
          </div>

          <SubmitButton pending={pending} pendingLabel="Logging in…">
            Log in
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
