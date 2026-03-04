/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: [
    { pattern: /bg-(blue|emerald|orange|rose|red|purple)-(50|100|600|700)/ },
    { pattern: /text-(blue|emerald|orange|rose|red|purple)-(500|600|700)/ },
    { pattern: /border-(blue|emerald|orange|rose|red)-(100|500|600)/ },
    { pattern: /shadow-(blue|emerald)-(100|200)/ },
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
