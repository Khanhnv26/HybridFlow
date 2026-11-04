/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        elevated: 'rgb(var(--elevated-rgb) / <alpha-value>)',
        subtle: 'rgb(var(--subtle-rgb) / <alpha-value>)',
        line: 'rgb(var(--line-rgb) / <alpha-value>)',
        primary: 'rgb(var(--primary-rgb) / <alpha-value>)',
        secondary: 'rgb(var(--secondary-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        'on-accent': '#ffffff',
        info: 'var(--info)',
        'info-soft': 'rgb(var(--info-soft-rgb) / <alpha-value>)',
        success: 'var(--success)',
        'success-soft': 'rgb(var(--success-soft-rgb) / <alpha-value>)',
        warning: 'var(--warning)',
        'warning-soft': 'rgb(var(--warning-soft-rgb) / <alpha-value>)',
        danger: 'var(--danger)',
        'danger-soft': 'rgb(var(--danger-soft-rgb) / <alpha-value>)',
        violet: 'var(--violet)',
        'violet-soft': 'rgb(var(--violet-soft-rgb) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
