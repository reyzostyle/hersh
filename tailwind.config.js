/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        // Numbers and timestamps are most of what this product outputs, and in
        // mono they read as instrument readings rather than as prose.
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.035em',
      },
    },
  },
  plugins: [],
};
