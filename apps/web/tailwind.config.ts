import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
      },
      colors: {
        gold: {
          DEFAULT: '#F5B94B',
          light: '#f9d07c',
          dark: '#d4981f',
        },
        page: '#08090d',
        surface: '#0d0f14',
      },
      borderRadius: {
        glass: '20px',
      },
      boxShadow: {
        glass:
          'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 24px rgba(0,0,0,0.12)',
        'glass-hover':
          'inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 55px rgba(0,0,0,0.34), 0 0 0 6px rgba(245,185,75,0.10)',
        btn: '0 14px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.10)',
        'btn-hover':
          '0 18px 55px rgba(0,0,0,0.34), 0 0 0 6px rgba(245,185,75,0.12), inset 0 1px 0 rgba(255,255,255,0.10)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'slide-up': 'slideUp 0.6s ease-out forwards',
        float: 'float 6s ease-in-out infinite',
        marquee: 'marquee 44s linear infinite',
        'marquee-reverse': 'marqueeReverse 44s linear infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        shimmer: 'shimmer 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        marqueeReverse: {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
