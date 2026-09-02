/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      // ── Semantic color tokens ──────────────────────────────────────────────
      // Backed by CSS variables (R G B channels) defined in src/index.css, so
      // the whole app can be re-themed in one place and alpha modifiers work
      // (e.g. bg-surface/60). Prefer these over raw gray-*/blue-* utilities.
      colors: {
        canvas:        'rgb(var(--c-canvas) / <alpha-value>)',      // app background
        surface:       'rgb(var(--c-surface) / <alpha-value>)',     // cards, panels
        'surface-2':   'rgb(var(--c-surface-2) / <alpha-value>)',   // raised / inputs
        'surface-3':   'rgb(var(--c-surface-3) / <alpha-value>)',   // hover / inset
        line:          'rgb(var(--c-line) / <alpha-value>)',        // borders
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
        content:       'rgb(var(--c-content) / <alpha-value>)',     // primary text
        muted:         'rgb(var(--c-muted) / <alpha-value>)',       // secondary text
        faint:         'rgb(var(--c-faint) / <alpha-value>)',       // tertiary / labels
        accent:        'rgb(var(--c-accent) / <alpha-value>)',
        'accent-hover':'rgb(var(--c-accent-hover) / <alpha-value>)',
        'accent-fg':   'rgb(var(--c-accent-fg) / <alpha-value>)',
        // Semantic state (distinct from the accent hue)
        success:       'rgb(var(--c-success) / <alpha-value>)',
        warning:       'rgb(var(--c-warning) / <alpha-value>)',
        danger:        'rgb(var(--c-danger) / <alpha-value>)',
        info:          'rgb(var(--c-info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
               'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas',
               'Liberation Mono', 'monospace'],
      },
      fontSize: {
        // Tightened UI type scale
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
      },
      borderRadius: {
        card: '0.625rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.25), 0 1px 3px 0 rgb(0 0 0 / 0.15)',
        pop:  '0 10px 30px -8px rgb(0 0 0 / 0.55)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-in-up': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-in': 'fade-in 0.18s ease-out',
        'fade-in-up': 'fade-in-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
}
