/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        neon: '#10b981',
        'neon-dim': '#0e8e6c',
        gold: '#d4af37',
        danger: '#d83a3a',
        'felt-hi': '#1f7a5c',
        'felt-mid': '#0e4a36',
        'felt-lo': '#052218',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        cinzel: ['Cinzel', 'serif'],
      },
      animation: {
        'breathe': 'breathe 2s ease-in-out infinite',
        'timer': 'timer 12s linear forwards',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { boxShadow: '0 0 0 2px #10b981, 0 0 18px rgba(16, 185, 129, 0.6), 0 6px 14px rgba(0,0,0,0.6)' },
          '50%':      { boxShadow: '0 0 0 2px #10b981, 0 0 32px rgba(16, 185, 129, 0.95), 0 6px 14px rgba(0,0,0,0.6)' },
        },
        timer: { to: { strokeDashoffset: '226' } },
      },
    },
  },
  plugins: [],
};
