/** @type {import('tailwindcss').Config} */
// The Imbehe palette (Color Hunt): #87B6BC teal, #BED4CB sage, #F6F09F butter, #B35656 rose.
// Each of the four is the exact anchor of its scale (teal-400, sage-300, sun-300, rose-600). The other numbered shades are tints and
// shades of the same hue, used where a pastel colour cannot carry text (labels, links, button fills) and for borders and hover states.
// `ink` is the neutral for text, derived from the teal hue, because the palette has no dark colour of its own. Its values live in
// CSS variables (src/index.css) so the whole scale flips in dark mode: ink-900 is dark text on white, and light text on the dark surface.
export default {
  darkMode: 'class', // the theme is set by a `dark` class on <html> (see src/theme/ThemeContext.jsx)
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Text, borders and neutral surfaces. 900 is the body text colour.
        ink: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, `rgb(var(--ink-${n}) / <alpha-value>)`])),
        // #87B6BC (400). Header, sidebar, hero. Primary buttons and links use 600/700 so white text stays readable (4.6:1 and up).
        teal: {
          50: '#f0f7f8', 100: '#dcecee', 200: '#bddade', 300: '#a3c8cd', 400: '#87B6BC',
          500: '#5f9aa2', 600: '#447d86', 700: '#36646c', 800: '#2b4f56', 900: '#213c42',
        },
        // #BED4CB (300). Page backgrounds, footer, soft panels, secondary actions (700 for filled buttons).
        sage: {
          50: '#f4f8f6', 100: '#e8f0ec', 200: '#d6e5dd', 300: '#BED4CB', 400: '#a3c0b3',
          500: '#86a798', 600: '#6b8c7c', 700: '#55705f', 800: '#445a4c', 900: '#35463c',
        },
        // #F6F09F (300). Highlights and calls to action. Always with dark (ink) text, never white.
        sun: {
          50: '#fdfcec', 100: '#fbf8cf', 200: '#f9f4b7', 300: '#F6F09F', 400: '#ece37c',
          500: '#d9cf55', 600: '#b5ab36', 700: '#8a8228', 800: '#655f1f', 900: '#454116',
        },
        // #B35656 (600). The warm accent, and also errors and destructive actions (the palette's only red).
        rose: {
          50: '#fbf1f1', 100: '#f6e0e0', 200: '#ecc3c3', 300: '#dd9c9c', 400: '#c97676',
          500: '#bc6262', 600: '#B35656', 700: '#964444', 800: '#773636', 900: '#5a2929',
        },
        paper: 'rgb(var(--paper) / <alpha-value>)', // the soft page tint behind white panels
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(90deg, #87B6BC 0%, #BED4CB 38%, #F6F09F 68%, #B35656 100%)',
        'brand-gradient-v': 'linear-gradient(180deg, #87B6BC 0%, #BED4CB 38%, #F6F09F 68%, #B35656 100%)',
      },
      keyframes: {
        // The announcement ticker: the track holds the text twice, so sliding by half its width loops without a jump.
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
      },
      animation: { marquee: 'marquee var(--marquee-duration, 30s) linear infinite' },
      fontFamily: {
        sans: ['"Public Sans"', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"Public Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
