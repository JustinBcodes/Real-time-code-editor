/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'mono': ['Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'monospace'],
      },
      colors: {
        'editor-bg': '#1e1e1e',
        'editor-sidebar': '#252526',
        'editor-border': '#3c3c3c',
      }
    },
  },
  plugins: [],
} 