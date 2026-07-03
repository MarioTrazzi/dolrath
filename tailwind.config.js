/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Design System Colors
        primary: '#e94560',
        'primary-dark': '#c73650',
        secondary: '#1a1a2e',
        accent: '#16213e',
        background: '#0f0f23',
        surface: '#1e1e3f',
        'text-primary': '#ffffff',
        'text-secondary': '#b4b4d1',
        textsec: '#b4b4d1', // alias curto usado na landing (text-textsec)
        success: '#2ecc71',
        error: '#e74c3c',
        warning: '#f39c12',
        
        // Legacy colors (mantidos para compatibilidade)
        'dolrath-primary': '#8B5CF6',
        'dolrath-secondary': '#06B6D4',
        'dolrath-accent': '#F59E0B',
        'dolrath-danger': '#EF4444',
        'dolrath-success': '#10B981',
        'dolrath-dark': '#1F2937',
        'dolrath-light': '#F3F4F6',
      },
      fontFamily: {
        'primary': ['var(--font-inter)', 'Inter', 'sans-serif'],
        'game': ['Courier New', 'monospace'],
      },
      animation: {
        'dice-roll': 'spin 0.5s ease-in-out',
        'combat-hit': 'pulse 0.3s ease-in-out',
        'level-up': 'bounce 1s ease-in-out',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
} 