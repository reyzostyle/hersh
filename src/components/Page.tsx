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

const WIDTHS = {
  // Reading column: prose, stats, a list you scan top to bottom.
  md: 'max-w-2xl',
  // Working column: card grids and filter rows that need the room.
  lg: 'max-w-5xl',
} as const;

export function Page({
  width = 'md',
  children,
  className = '',
}: {
  width?: keyof typeof WIDTHS;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-full flex justify-center">
      <div className={`sheet w-full ${WIDTHS[width]} px-5 sm:px-8 pt-12 sm:pt-16 pb-20 ${className}`}>
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
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`${padded ? 'p-5 sm:p-6' : ''} ${className}`}
      style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}
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
