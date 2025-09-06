import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        'brand': {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49'
        },
        'neutral': {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
          950: '#0c0a09'
        },
        // shadcn/ui color tokens
        'background': 'hsl(var(--background))',
        'foreground': 'hsl(var(--foreground))',
        'card': {
          'DEFAULT': 'hsl(var(--card))',
          'foreground': 'hsl(var(--card-foreground))'
        },
        'popover': {
          'DEFAULT': 'hsl(var(--popover))',
          'foreground': 'hsl(var(--popover-foreground))'
        },
        'primary': {
          'DEFAULT': 'hsl(var(--primary))',
          'foreground': 'hsl(var(--primary-foreground))'
        },
        'secondary': {
          'DEFAULT': 'hsl(var(--secondary))',
          'foreground': 'hsl(var(--secondary-foreground))'
        },
        'muted': {
          'DEFAULT': 'hsl(var(--muted))',
          'foreground': 'hsl(var(--muted-foreground))'
        },
        'accent': {
          'DEFAULT': 'hsl(var(--accent))',
          'foreground': 'hsl(var(--accent-foreground))'
        },
        'destructive': {
          'DEFAULT': 'hsl(var(--destructive))',
          'foreground': 'hsl(var(--destructive-foreground))'
        },
        'border': 'hsl(var(--border))',
        'input': 'hsl(var(--input))',
        'ring': 'hsl(var(--ring))'
      },
      fontFamily: {
        'display': ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        'body': ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono Variable', 'JetBrains Mono', 'Consolas', 'Monaco', 'Courier New', 'monospace']
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            '--tw-prose-body': theme('colors.slate.700'),
            '--tw-prose-headings': theme('colors.slate.900'),
            '--tw-prose-links': theme('colors.brand.600'),
            '--tw-prose-links-hover': theme('colors.brand.700'),
            '--tw-prose-underline': theme('colors.brand.500 / 0.2'),
            '--tw-prose-underline-hover': theme('colors.brand.500'),
            '--tw-prose-bold': theme('colors.slate.900'),
            '--tw-prose-counters': theme('colors.slate.500'),
            '--tw-prose-bullets': theme('colors.slate.300'),
            '--tw-prose-hr': theme('colors.slate.200'),
            '--tw-prose-quotes': theme('colors.slate.900'),
            '--tw-prose-quote-borders': theme('colors.slate.200'),
            '--tw-prose-captions': theme('colors.slate.500'),
            '--tw-prose-code': theme('colors.slate.900'),
            '--tw-prose-pre-code': theme('colors.slate.200'),
            '--tw-prose-pre-bg': theme('colors.slate.800'),
            '--tw-prose-th-borders': theme('colors.slate.300'),
            '--tw-prose-td-borders': theme('colors.slate.200'),
          }
        },
        invert: {
          css: {
            '--tw-prose-body': theme('colors.slate.300'),
            '--tw-prose-headings': theme('colors.white'),
            '--tw-prose-links': theme('colors.brand.400'),
            '--tw-prose-links-hover': theme('colors.brand.300'),
            '--tw-prose-underline': theme('colors.brand.500 / 0.3'),
            '--tw-prose-underline-hover': theme('colors.brand.500'),
            '--tw-prose-bold': theme('colors.white'),
            '--tw-prose-counters': theme('colors.slate.400'),
            '--tw-prose-bullets': theme('colors.slate.600'),
            '--tw-prose-hr': theme('colors.slate.700'),
            '--tw-prose-quotes': theme('colors.slate.100'),
            '--tw-prose-quote-borders': theme('colors.slate.700'),
            '--tw-prose-captions': theme('colors.slate.400'),
            '--tw-prose-code': theme('colors.white'),
            '--tw-prose-pre-code': theme('colors.slate.300'),
            '--tw-prose-pre-bg': theme('colors.slate.900'),
            '--tw-prose-th-borders': theme('colors.slate.600'),
            '--tw-prose-td-borders': theme('colors.slate.700'),
          }
        }
      }),
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'fade-in-down': 'fadeInDown 0.6s ease-out',
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-in-left': 'slideInLeft 0.6s ease-out',
        'slide-in-right': 'slideInRight 0.6s ease-out',
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s infinite',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        }
      },
      backdropBlur: {
        'xs': '2px',
      },
      screens: {
        'xs': '475px',
      }
    }
  },
  plugins: [
    typography
  ]
}