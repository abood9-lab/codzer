import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { MetaFunction } from 'react-router';
import { useNavigate } from 'react-router';
import { AuthShell } from '~/components/auth/AuthShell';
import { ExistingSession } from '~/components/auth/ExistingSession';
import {
  Field,
  FormMessage,
  PasswordField,
  PasswordRequirements,
  SubmitButton,
  TextLink,
} from '~/components/auth/FormControls';
import { APP_HOME_PATH, friendlyAuthError, refreshAuth, signUp, useAuth } from '~/lib/codzer/auth';

export const meta: MetaFunction = () => [
  { title: 'Create account · Codzer' },
  { name: 'description', content: 'Create your Codzer account and start building your ideas with AI.' },
];

type FieldName = 'name' | 'email' | 'password' | 'confirm';
type FieldErrors = Partial<Record<FieldName, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const navigate = useNavigate();
  const { status } = useAuth();

  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ email: string; verified: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshAuth();
  }, []);

  useEffect(() => {
    if (!success) {
      return;
    }

    const timer = setTimeout(() => navigate(APP_HOME_PATH, { replace: true }), 1400);

    return () => clearTimeout(timer);
  }, [success, navigate]);

  const set = (name: FieldName) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  };

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (!values.name.trim()) {
      errors.name = 'Enter your name.';
    }

    if (!EMAIL_PATTERN.test(values.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }

    if (values.password.length < 8) {
      errors.password = 'Use at least 8 characters.';
    }

    if (values.confirm !== values.password) {
      errors.confirm = 'Passwords do not match.';
    }

    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (pending) {
      return;
    }

    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);

    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setPending(true);

    try {
      const user = await signUp({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
      });

      setSuccess({ email: user.email as string, verified: true });
    } catch (caught) {
      setFormError(friendlyAuthError(caught));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  };

  if (success) {
    return (
      <AuthShell heading="Create your Codzer account" lede="Start building your ideas with AI.">
        <div role="status" tabIndex={-1} className="codzer-rise rounded-xl border border-[#00E887]/45 bg-[#E9FBF3] p-6 text-center focus:outline-none">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#00E887] text-[#04140D]">
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path d="M5 12.5 10 17.5l9-11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h3 className="mt-4 text-[18px] font-semibold text-[#0A0B0A]">Account created</h3>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#0B5B3C]">
            {success.verified
              ? `You're all set, ${values.name.trim().split(' ')[0] || 'builder'} — taking you to Codzer.`
              : `Check ${success.email} to verify your address. You can start building right away.`}
          </p>
          <p className="mt-4 text-[14px] text-[#5C635F]">
            <TextLink to={APP_HOME_PATH}>Continue to Codzer →</TextLink>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Create your Codzer account"
      lede="Start building your ideas with AI."
      footer={
        <>
          Already have an account? <TextLink to="/login">Log in</TextLink>
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
            label="Name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={values.name}
            onChange={set('name')}
            error={fieldErrors.name}
            required
          />

          <Field
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={values.email}
            onChange={set('email')}
            error={fieldErrors.email}
            required
          />

          <div>
            <PasswordField
              label="Password"
              name="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={values.password}
              onChange={set('password')}
              error={fieldErrors.password}
              required
            />
            <PasswordRequirements value={values.password} />
          </div>

          <PasswordField
            label="Confirm password"
            name="confirm"
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={values.confirm}
            onChange={set('confirm')}
            error={fieldErrors.confirm}
            required
          />

          <SubmitButton pending={pending} pendingLabel="Creating account…">
            Create account
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
