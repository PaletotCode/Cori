/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        cori: ['Cori', 'sans-serif'],
        sans: ['Cori', 'sans-serif'],
      },
      colors: {
        primary: {
          light: '#a855f7', // purple-500
          DEFAULT: '#9333ea', // purple-600
          dark: '#7e22ce', // purple-700
        },
        surface: {
          light: '#ffffff',
          dark: '#1f2937',
        },
        background: {
          light: '#f9fafb',
          dark: '#111827',
        }
      },
      spacing: {
        'xs': 'var(--pad-xs)', // 4px
        'sm': 'var(--pad-sm)', // 8px
        'md': 'var(--pad-md)', // 16px
        'lg': 'var(--pad-lg)', // 24px
        'xl': 'var(--pad-xl)', // 32px
        '2xl': 'var(--pad-2xl)', // 40px
      }
    },
  },
  plugins: [],
}
