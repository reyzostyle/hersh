// Minimal dependency-free toast. Appends a transient element to <body>.
export function showToast(message: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'left:50%',
    'transform:translateX(-50%) translateY(8px)',
    'z-index:9999',
    'padding:11px 18px',
    'border-radius:12px',
    'font-size:14px',
    'font-weight:600',
    'color:#fff',
    'max-width:90vw',
    `background:${type === 'success' ? '#0EA4E9' : '#ef4444'}`,
    'box-shadow:0 10px 30px rgba(0,0,0,0.45)',
    'opacity:0',
    'transition:opacity .2s ease, transform .2s ease',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(() => el.remove(), 250);
  }, 2600);
}
