/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#F1F1F1',
        primary: {
          DEFAULT: '#FF7417',
          hover: '#E9650E',
          light: '#FFF0E6',
        },
        text: {
          main: '#1F2933',
          secondary: '#667085',
        },
        card: '#F2F2F2',
        white: '#FFFFFF',
        success: {
          DEFAULT: '#22A06B',
          light: '#E8F5E9',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#FEF3C7',
        },
        danger: {
          DEFAULT: '#E5484D',
          light: '#FEE2E2',
        },
      },
      boxShadow: {
        'neu-outer': '6px 6px 12px #cdcdcd, -6px -6px 12px #ffffff',
        'neu-inner': 'inset 4px 4px 8px #cdcdcd, inset -4px -4px 8px #ffffff',
        'neu-sm': '4px 4px 8px #d1d1d1, -4px -4px 8px #ffffff',
        'neu-inner-sm': 'inset 2px 2px 5px #cdcdcd, inset -2px -2px 5px #ffffff',
        'neu-glow': '0 0 15px rgba(255, 116, 23, 0.25)',
      },
      borderRadius: {
        'xl': '14px',
        '2xl': '18px',
        '3xl': '24px',
        '4xl': '32px',
      },
      fontFamily: {
        brand: ['"Dancing Script"', '"Caveat"', 'cursive'],
        script: ['"Dancing Script"', '"Caveat"', 'cursive'],
        display: ['"Outfit"', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
