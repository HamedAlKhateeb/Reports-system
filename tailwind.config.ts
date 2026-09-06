import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans Arabic', 'Noto Sans Arabic', 'Tajawal', 'Readex Pro', 'system-ui', 'sans-serif'],
        serif: ['Amiri', 'serif'],
        heading: ['IBM Plex Sans Arabic', 'Noto Sans Arabic', 'sans-serif'],
      },
      colors: {
        // Editorial Warm Palette
        warm: {
          bg: '#FAFAF8',
          card: '#FFFFFF',
          border: '#E7E6E2',
          text: '#202020',
          muted: '#6B6964',
          darkBg: '#161615',
          darkCard: '#20201F',
          darkBorder: '#2B2B29',
          darkText: '#F2F2EE',
          darkMuted: '#9E9C96',
        },
        // Quiet Sage / Deep Olive Accent
        olive: {
          50: '#F4F6F4',
          100: '#E7ECE8',
          200: '#D1DBD3',
          300: '#AFC0B3',
          400: '#849E8B',
          500: '#5F7E68',
          600: '#486450',
          700: '#394E3F',
          800: '#2E4034',
          900: '#26342B',
          950: '#151D18',
        },
        // Legacy primary mapped to tasteful olive/teal tone
        primary: {
          50: '#F4F6F4',
          100: '#E7ECE8',
          200: '#D1DBD3',
          300: '#AFC0B3',
          400: '#6B8C75',
          500: '#486450',
          600: '#394E3F',
          700: '#2E4034',
          800: '#26342B',
          900: '#1D2721',
        },
      },
      borderRadius: {
        xl: '12px',
        '2xl': '14px',
      },
    },
  },
  plugins: [],
};
export default config;
