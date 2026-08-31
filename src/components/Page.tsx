import { RefreshOutlineIcon as Loader2, CloseCircleOutlineIcon as Cancel } from '@solar-icons/react';
import { Check } from './BrandIcons';

// ─── Page primitives ─────────────────────────────────────────────────────────
// The ruled grid is the app's ground, and it used to run straight through the
// type: every screen put transparent text on top of a background-image of
// lines, so a heading and a hairline could land on the same pixel row. The fix
// is one idea applied everywhere rather than a panel bolted on per screen —
// content sits on a SHEET, a solid column with hairline edges, and the grid
// stays in the margins beside it where it reads as precision instead of noise.
//
// Every tab is built from these four pieces, so "standardise Analytics and
// Competitors" is a matter of them using the same Page/PageHead/Panel/Tile as
// the hub rather than each screen inventing its own header and spacing.

// ONE column width, one gutter, one top offset, on every tab.
//
// There used to be four - 672 for the hub and Analytics, 768 for Settings, 896
// for Upgrade, 1024 for Competitors - each picked when that screen was written
// and never compared against the others. Switching tabs moved the left edge of
// the page, so the product read as several products. Worse, Upgrade set 896 on
// the header and 672 on the cards below it, so the heading and the content it
// described did not even start at the same x.
//
// What varies between screens is what goes INSIDE the column, never how wide
// the column is. Prose is kept readable within it by capping the paragraph, not
// by narrowing the page: see PageHead's subtitle.
const COLUMN = 'max-w-5xl';

export function Page({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-full flex justify-center">
      {/* flex column so a child can claim the leftover height - Loading needs
          it to sit in the middle of the page rather than in the middle of an
          arbitrary min-height. */}
      <div className={`sheet w-full ${COLUMN} flex flex-col px-5 sm:px-8 pt-12 sm:pt-16 pb-20 ${className}`}>
        {children}
      </div>
    </div>
  );
}

// One header shape for the whole product. The mono eyebrow names the tab, the
// display line names what you are looking at, and the sub-line is the one
// sentence explaining it — the same three notes in the same order on every
// screen, which is most of what "standardised" means here.
export function PageHead({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-10">
      <p className="label-mono mb-4">{eyebrow}</p>
      {/* The action sits beside the title on a wide screen and drops below it on
          a narrow one. Sharing a row with a segmented control was squeezing the
          display line into three ragged lines on a phone. */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <h1 className="display w-full sm:w-auto sm:flex-1 min-w-0" style={{ color: 'var(--text)' }}>{title}</h1>
        {action && <div className="flex-shrink-0 sm:pt-1">{action}</div>}
      </div>
      {subtitle && (
        <p className="text-[15px] mt-3 max-w-md text-balance" style={{ color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      )}
    </header>
  );
}

// A raised plate. Anything denser than a paragraph goes on one, so a chart or
// a block of numbers has an edge of its own rather than floating on the page.
export function Panel({
  children,
  className = '',
  padded = true,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  // A plate is sometimes the whole click target - a saved idea in a project
  // opens the video it came from. Optional, so a plain panel stays a plain
  // panel and does not acquire a role it cannot fulfil.
  onClick?: () => void;
}) {
  return (
    <div
      className={`${padded ? 'p-5 sm:p-6' : ''} ${className}`}
      style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}
      {...(onClick ? {
        onClick,
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
        },
      } : {})}
    >
      {children}
    </div>
  );
}

// A single measured number. Label above in mono, value in the display weight,
// an optional movement line under it in the one colour the app has.
export function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Panel className="min-w-0">
      <p className="label-mono mb-2">{label}</p>
      <p className="text-[26px] leading-none font-semibold tracking-tight tabular-nums truncate" style={{ color: 'var(--text)' }}>
        {value}
      </p>
      {/* The row keeps its height with or without a delta, so a grid of tiles
          never comes out ragged along the bottom. */}
      <p className="font-mono text-[11px] mt-2 h-[13px]" style={{ color: sub ? 'var(--process)' : 'transparent' }}>
        {sub ?? '—'}
      </p>
    </Panel>
  );
}

// Section rule inside a page: mono label, optional note, then the content.
export function Section({
  label,
  note,
  action,
  children,
  className = '',
}: {
  label: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-12 ${className}`}>
      <div className="flex items-baseline gap-4 mb-4">
        <p className="label-mono flex-1">{label}</p>
        {action}
      </div>
      {note && <p className="text-[13px] mb-4 -mt-1" style={{ color: 'var(--text-muted)' }}>{note}</p>}
      {children}
    </section>
  );
}

// Confirm and cancel for anything edited in place.
//
// Enter and Escape are not an interface: they are invisible, and a phone has
// neither. Every inline editor in the app gets the same pair of buttons in the
// same order, so committing a rename is the same gesture wherever you are.
//
// onMouseDown preventDefault matters more than it looks. These sit next to a
// focused input whose onBlur commits; without it, pressing Cancel would blur
// the field first, save the edit, and only then run the handler that was
// supposed to discard it.
export function EditActions({ onSave, onCancel, saving }: {
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  return (
    <span className="flex items-center gap-1 flex-shrink-0">
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={onSave}
        disabled={saving}
        title="Save"
        className="p-1 rounded-[var(--r-sm)] transition-colors hover:text-[var(--process)] disabled:opacity-40"
        style={{ color: 'var(--text-muted)' }}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={onCancel}
        title="Cancel"
        className="p-1 rounded-[var(--r-sm)] transition-colors hover:text-[var(--text)]"
        style={{ color: 'var(--text-faint)' }}
      >
        <Cancel className="w-4 h-4" />
      </button>
    </span>
  );
}

// Waiting, centred on both axes.
//
// Every tab had its own version pinned near the top - `justify-center pt-16` -
// which centres it horizontally and leaves it stranded high on the page while
// the rest of the screen is empty. It also drifted in size and colour between
// screens. One component, one place.
export function Loading() {
  return (
    // The negative margins cancel the sheet's own vertical padding (64 top, 80
    // bottom), which is deliberately asymmetric and would otherwise pull the
    // spinner 8px above the true centre of the page.
    <div className="flex-1 flex items-center justify-center -mt-12 sm:-mt-16 -mb-20">
      <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-faint)' }} />
    </div>
  );
}

// Dashed, quiet, and always inside the sheet — an empty tab should look like a
// place work has not happened yet, not like a screen that failed to load.
export function Empty({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--r-md)] px-6 py-12 flex flex-col items-center justify-center text-center gap-3"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--line-strong)' }}
    >
      {icon}
      <p className="text-[13px] max-w-sm text-balance" style={{ color: 'var(--text-muted)' }}>{children}</p>
    </div>
  );
}
