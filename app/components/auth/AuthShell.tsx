import type { ReactNode } from 'react';
import { CodzerBrand } from './CodzerBrand';
import './codzer-auth.scss';

/**
 * Split-screen Codzer authentication shell.
 *
 * Desktop: a ~47% visual panel (local photograph, dark overlay, brand,
 * headline, two decorative developer cards) beside an off-white form panel.
 * Mobile: the photograph collapses into a compact branded banner so the form
 * stays the focus — it is not a shrunken desktop layout.
 *
 * The photograph is decorative: every word it frames is also real text in the
 * DOM, so nothing essential lives inside the image.
 */

const VISUAL_HEADLINE = 'Turn your ideas into reality.';
const VISUAL_LEDE = 'Build, create, and bring your next big idea to life with Codzer.';

export function VisualPanel() {
  return (
    <aside className="relative isolate overflow-hidden bg-[#0A0B0A] h-[228px] sm:h-[272px] lg:h-auto">
      {/* Local asset: Unsplash, "MacBook with code" by Ilya Pavlov (Unsplash License). */}
      <img
        src="/images/codzer-workspace.jpg"
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-[62%_46%] opacity-90"
      />

      {/* Readability overlay: stronger on desktop where the type sits over it. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-[#0A0B0A] via-[#0A0B0A]/78 to-[#0A0B0A]/25 lg:bg-gradient-to-br lg:from-[#0A0B0A]/94 lg:via-[#0A0B0A]/62 lg:to-[#0A0B0A]/35"
      />
      <div aria-hidden="true" className="codzer-grid absolute inset-0 opacity-60" />
      <div
        aria-hidden="true"
        className="codzer-glow absolute -left-24 top-1/2 hidden h-[420px] w-[420px] -translate-y-1/2 lg:block"
      />

      <div className="relative flex h-full flex-col justify-between p-6 sm:p-8 lg:p-12">
        <div className="codzer-fade">
          <CodzerBrand tone="light" />
        </div>

        {/* Decorative developer cards — desktop only, purely illustrative. */}
        <div aria-hidden="true" className="codzer-fade codzer-delay-2 pointer-events-none absolute right-10 top-24 hidden w-[318px] flex-col gap-4 lg:flex">
          <figure className="rounded-xl border border-white/10 bg-[#0E100F]/88 p-4 shadow-2xl shadow-black/60 backdrop-blur-md">
            <figcaption className="mb-3 flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#00E887]/70" />
              <span className="ml-2 text-[10.5px] uppercase tracking-[0.16em] text-white/35">codzer</span>
            </figcaption>
            <pre className="overflow-hidden font-mono text-[12.5px] leading-[1.7] text-[#9BA5A0]">
              <code>
                {'const app = await codzer.build({\n'}
                {'  prompt: "launch page for my startup",\n'}
                {'  style: "premium, minimal",\n'}
                {'});\n'}
                <span className="text-[#00E887]">{'// shipped in 38s'}</span>
                {'\n'}
                <span className="text-[#00E887]">{'›'}</span>{' '}
                <span className="codzer-caret inline-block h-[13px] w-[7px] translate-y-[2px] bg-[#00E887]" />
              </code>
            </pre>
          </figure>

          <figure className="rounded-xl border border-white/10 bg-[#0E100F]/88 p-4 shadow-2xl shadow-black/60 backdrop-blur-md">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-[#F7F8F6]">Codzer AI</span>
              <span className="text-[11.5px] tabular-nums text-white/45">62%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[62%] rounded-full bg-[#00E887]" />
            </div>
            <p className="mt-2.5 text-[11.5px] text-white/45">Generating components</p>
          </figure>
        </div>

        <div className="codzer-fade max-w-[30rem]">
          <h1 className="text-[26px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#F7F8F6] sm:text-[30px] lg:text-[40px]">
            {VISUAL_HEADLINE}
          </h1>
          <p className="mt-3 max-w-[34ch] text-[14.5px] leading-relaxed text-white/60 sm:text-[15.5px]">
            {VISUAL_LEDE}
          </p>
        </div>
      </div>
    </aside>
  );
}

export interface AuthShellProps {
  heading: string;
  lede: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ heading, lede, children, footer }: AuthShellProps) {
  return (
    <div className="codzer-page lg:grid lg:grid-cols-[minmax(0,47%)_minmax(0,53%)]">
      <VisualPanel />

      <main className="flex items-center justify-center px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
        <div className="w-full max-w-[420px]">
          <div className="codzer-rise lg:hidden">
            <CodzerBrand />
          </div>

          <div className="codzer-rise codzer-delay-1 mt-7 lg:mt-0">
            <div className="hidden lg:block">
              <CodzerBrand />
            </div>

            <h2 className="mt-7 text-[27px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#0A0B0A] sm:text-[30px]">
              {heading}
            </h2>
            <p className="mt-2.5 text-[15px] leading-relaxed text-[#5C635F]">{lede}</p>
          </div>

          <div className="codzer-rise codzer-delay-2 mt-8">{children}</div>

          {footer ? (
            <div className="codzer-fade codzer-delay-3 mt-7 border-t border-[#E3E5E2] pt-6 text-center text-[14.5px] text-[#5C635F]">
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
