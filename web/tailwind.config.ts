import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      colors: {
        bg:      '#0a0a0a',
        surface: '#111111',
        border:  '#222222',
        muted:   '#444444',
        dim:     '#888888',
        txt:     '#e2e2e2',
        accent:  '#4f8ef7',
        green:   '#22c55e',
        yellow:  '#eab308',
        red:     '#ef4444',
        orange:  '#f97316',
      },
    },
  },
  plugins: [],
};

export default config;
