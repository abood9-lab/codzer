import { classNames } from '~/utils/classNames';

/**
 * Original Codzer identity: an angular bracket pair (code) wrapping a spark
 * (AI) on a near-black tile. Deliberately not derived from any existing
 * developer-tool logo.
 */
export function CodzerMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="Codzer"
      className={classNames('shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="9.25" fill="#0A0B0A" />
      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="9.25"
        fill="none"
        stroke="#00E887"
        strokeOpacity="0.38"
        strokeWidth="1.5"
      />
      <path
        d="M12.3 10.6 6.9 16l5.4 5.4"
        fill="none"
        stroke="#00E887"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.7 10.6 25.1 16l-5.4 5.4"
        fill="none"
        stroke="#00E887"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 12.4 17.05 14.95 19.6 16 17.05 17.05 16 19.6 14.95 17.05 12.4 16 14.95 14.95Z"
        fill="#00E887"
      />
    </svg>
  );
}

export function CodzerWordmark({
  className,
  tone = 'dark',
}: {
  className?: string;
  tone?: 'dark' | 'light';
}) {
  return (
    <span
      className={classNames(
        'codzer-mark text-[17px] font-semibold leading-none tracking-[-0.02em]',
        tone === 'dark' ? 'text-[#0A0B0A]' : 'text-[#F7F8F6]',
        className,
      )}
    >
      Codzer
    </span>
  );
}

/** Compact lockup used above the form and on the visual panel. */
export function CodzerBrand({
  tone = 'dark',
  size = 'md',
  className,
}: {
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span className={classNames('inline-flex items-center gap-2.5', className)}>
      <CodzerMark className={size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'} />
      <CodzerWordmark tone={tone} />
    </span>
  );
}
