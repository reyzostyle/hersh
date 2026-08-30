/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Eight greys were in use across 356 call sites, which is not a palette,
      // it is eight people guessing. Tailwind's own names are remapped onto a
      // three-step scale so every existing class lands on one of them and no
      // component had to be edited.
      colors: {
        // Emerald was in use at three different shades for the same idea.
        // All of it resolves to the one process colour.
        emerald: {
          100: 'var(--process)', 200: 'var(--process)', 300: 'var(--process)',
          400: 'var(--process)', 500: 'var(--process)', 600: 'var(--process)',
          700: 'var(--process)',
        },
        gray: {
          100: 'var(--text)',
          200: 'var(--text)',
          300: 'var(--text)',
          400: 'var(--text-muted)',
          500: 'var(--text-muted)',
          600: 'var(--text-faint)',
          700: 'var(--text-faint)',
          800: 'var(--bg-raised)',
          900: 'var(--on-accent)',
        },
      },
      // Same treatment for radii: six values become three plus the pill.
      borderRadius: {
        md: 'var(--r-sm)',
        lg: 'var(--r-sm)',
        xl: 'var(--r-md)',
        '2xl': 'var(--r-lg)',
        '3xl': 'var(--r-lg)',
      },
      letterSpacing: {
        tightest: '-0.035em',
      },
    },
  },
  plugins: [],
};
