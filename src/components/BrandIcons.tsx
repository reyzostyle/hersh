export function Check({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

// Brand marks the icon set does not carry, and should not: a logo drawn in
// someone else's house style is a wrong logo. Kept as flat fills so they sit
// next to the rounded outline set without looking pasted in.
export function Youtube({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z" />
    </svg>
  );
}

export function Twitter({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.5L6.3 22H3.2l7.3-8.3L2.8 2h6.4l4.4 5.9L18.9 2Zm-1.1 18.1h1.7L8.3 3.8H6.4l11.4 16.3Z" />
    </svg>
  );
}
