/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: '#0f5c45', felt2: '#0a4534', rail: '#3b2417', gold: '#e8c36a', gold2: '#b8893a',
        night: '#0c0b10', ink: '#16161a', cream: '#f6efe2', plum: '#5b2a86', ruby: '#d23a4a',
      },
      boxShadow: { card: '0 8px 16px -6px rgba(0,0,0,.6), 0 1px 2px rgba(0,0,0,.35)' },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
