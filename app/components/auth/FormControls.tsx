import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router';
import { classNames } from '~/utils/classNames';

/**
 * Shared Codzer authentication form controls. Every field wires its label,
 * description, error message and autocomplete hints together so the three auth
 * pages stay identical instead of each growing its own markup.
 */

const inputBase =
  'w-full rounded-lg border bg-white px-3.5 text-[15px] text-[#0A0B0A] placeholder:text-[#9AA19D] outline-none transition-[border-color,box-shadow] duration-200';

const inputState = (hasError: boolean) =>
  hasError
    ? 'border-[#E5484D] hover:border-[#E5484D] focus:border-[#E5484D] focus:ring-4 focus:ring-[#E5484D]/15'
    : 'border-[#E3E5E2] hover:border-[#C9CDC9] focus:border-[#00E887] focus:ring-4 focus:ring-[#00E887]/20';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  hint?: ReactNode;
  trailing?: ReactNode;
}

export function Field({ label, error, hint, trailing, className, ...props }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13.5px] font-medium text-[#3C423F]">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={classNames('h-11', inputBase, inputState(Boolean(error)), trailing ? 'pr-11' : '', className)}
          {...props}
        />
        {trailing ? <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div> : null}
      </div>

      {error ? (
        <p id={errorId} className="text-[13px] leading-snug text-[#C1292E]">
          {error}
        </p>
      ) : null}

      {hint ? (
        <p id={hintId} className="text-[13px] leading-snug text-[#7A817D]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[18px] w-[18px]">
      <path
        d="M1.7 10S4.6 4.9 10 4.9 18.3 10 18.3 10 15.4 15.1 10 15.1 1.7 10 1.7 10Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {!open ? (
        <path d="M3.5 16.5 16.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

export function PasswordField({ label, error, hint, ...props }: FieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="rounded-md p-2 text-[#7A817D] transition-colors hover:text-[#0A0B0A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E887]/50"
        >
          <EyeIcon open={visible} />
        </button>
      }
      {...props}
    />
  );
}

export function FormMessage({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const isError = tone === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={classNames(
        'rounded-lg border px-3.5 py-3 text-[14px] leading-snug',
        isError
          ? 'border-[#E5484D]/35 bg-[#FDECEC] text-[#9B2C31]'
          : 'border-[#00E887]/45 bg-[#E9FBF3] text-[#0B5B3C]',
      )}
    >
      {children}
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={classNames('animate-spin', className)} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function SubmitButton({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#00E887] px-5 text-[15px] font-semibold text-[#04140D] shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_8px_20px_-12px_rgba(0,232,135,0.9)] transition-all duration-200 hover:bg-[#00D77D] hover:shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_12px_26px_-12px_rgba(0,232,135,0.95)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00E887]/40 active:translate-y-px disabled:pointer-events-none disabled:opacity-70"
    >
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  {
    id: 'mix',
    label: 'A letter and a number',
    test: (v: string) => /[A-Za-z]/.test(v) && /\d/.test(v),
  },
] as const;  /** Live, non-blocking guidance — Firebase still enforces the project policy. */
export function PasswordRequirements({ value }: { value: string }) {
  return (
    <ul className="mt-2.5 space-y-1.5">
      <li className="text-[12.5px] font-medium text-[#7A817D]">Your password should have:</li>
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);

        return (
          <li key={rule.id} className="flex items-center gap-2 text-[13px] text-[#5C635F]">
            <span
              aria-hidden="true"
              className={classNames(
                'flex h-4 w-4 items-center justify-center rounded-full transition-colors duration-200',
                ok ? 'bg-[#00E887] text-[#04140D]' : 'border border-[#D6DAD6] text-transparent',
              )}
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3">
                <path
                  d="M2.5 6.3 5 8.8l4.5-5.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={ok ? 'text-[#0B5B3C]' : undefined}>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function TextLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={classNames(
        'rounded-sm font-medium text-[#0A0B0A] underline decoration-[#00E887] decoration-2 underline-offset-4 transition-colors duration-200 hover:text-[#0B7A51] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E887]/50 focus-visible:ring-offset-2',
        className,
      )}
    >
      {children}
    </Link>
  );
}
