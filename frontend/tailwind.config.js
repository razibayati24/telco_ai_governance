/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'db-orange': '#FF6F00',
        'db-orange-light': '#FF9100',
        'db-red': '#FF3621',
        'db-dark': {
          900: '#0D1117',
          800: '#161B22',
          700: '#1C2333',
          600: '#21293A',
          500: '#2D3748',
        },
      },
    },
  },
  plugins: [],
};
