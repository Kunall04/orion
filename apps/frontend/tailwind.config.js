/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)',
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        inset: 'var(--inset)',
        hover: 'var(--hover)',
        'hover-2': 'var(--hover-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        'line-soft': 'var(--line-soft)',
        field: 'var(--field)',
        accent: {
          DEFAULT: 'var(--accent)',
          ink: 'var(--accent-ink)',
          tint: 'var(--accent-tint)',
        },
        green: {
          DEFAULT: 'var(--green)',
          tint: 'var(--green-tint)',
        },
        orange: {
          DEFAULT: 'var(--orange)',
          tint: 'var(--orange-tint)',
        },
        red: {
          DEFAULT: 'var(--red)',
          tint: 'var(--red-tint)',
        },
      },
      borderRadius: {
        chip: '6px',
        control: '8px',
        card: '10px',
        window: '14px',
      },
      maxWidth: {
        '80': '20rem',
        '86': '21.5rem',
        '95': '23.75rem',
        '105': '26.25rem',
        '110': '27.5rem',
        '120': '30rem',
      },
      spacing: {
        '4.5': '1.125rem',
        '5.5': '1.375rem',
        '6.5': '1.625rem',
      },
      boxShadow: {
        hairline: 'var(--shadow-hairline)',
        btn: 'var(--shadow-btn)',
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        overlay: 'var(--shadow-overlay)',
        'inset-field': 'var(--shadow-inset-field)',
      },
      keyframes: {
        'shimmer-text': {
          '0%': { backgroundPosition: '150%' },
          '100%': { backgroundPosition: '-50%' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pixel-on': {
          '0%, 100%': { opacity: '0.15' },
          '18%, 42%': { opacity: '1' },
          '62%': { opacity: '0.15' },
        },
        'caret-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'shimmer-text': 'shimmer-text 1.4s linear infinite',
        'fade-up': 'fade-up 400ms cubic-bezier(0.23, 1, 0.32, 1) both',
        'fade-in': 'fade-in 150ms ease-out both',
        'pop-in': 'pop-in 300ms cubic-bezier(0.23, 1, 0.32, 1) both',
        'pixel-on': 'pixel-on 650ms ease-in-out infinite',
        'caret-blink': 'caret-blink 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
