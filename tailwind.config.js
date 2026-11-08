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
        },
        text: {
          main: '#1F2933',
          secondary: '#667085',
        },
        card: '#F2F2F2',
        white: '#FFFFFF',
        success: '#22A06B',
        warning: '#F59E0B',
        danger: '#E5484D',
      },
      boxShadow: {
        'neu-outer': '6px 6px 12px #cdcdcd, -6px -6px 12px #ffffff',
        'neu-inner': 'inset 4px 4px 8px #cdcdcd, inset -4px -4px 8px #ffffff',
        'neu-sm': '4px 4px 8px #d1d1d1, -4px -4px 8px #ffffff',
        'neu-inner-sm': 'inset 2px 2px 5px #cdcdcd, inset -2px -2px 5px #ffffff',
      },
      borderRadius: {
        '2xl': '18px',
        '3xl': '24px',
        '4xl': '32px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
