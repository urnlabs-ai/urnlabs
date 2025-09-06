import baseConfig from '@urnlabs/config/tailwind';

/** @type {import('tailwindcss').Config} */
export default {
  ...baseConfig,
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    '../../packages/ui/src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
  ],
  theme: {
    ...baseConfig.theme,
    extend: {
      ...baseConfig.theme.extend,
      // Personal site specific theme extensions
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'personal-hero': 'linear-gradient(135deg, #0072FF 0%, #00C853 100%)',
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: '#F5F5F5',
            '--tw-prose-body': '#F5F5F5',
            '--tw-prose-headings': '#F5F5F5',
            '--tw-prose-lead': '#F5F5F5',
            '--tw-prose-links': '#0072FF',
            '--tw-prose-bold': '#F5F5F5',
            '--tw-prose-counters': '#F5F5F5',
            '--tw-prose-bullets': '#F5F5F5',
            '--tw-prose-hr': '#1A1A1A',
            '--tw-prose-quotes': '#F5F5F5',
            '--tw-prose-quote-borders': '#0072FF',
            '--tw-prose-captions': '#F5F5F5',
            '--tw-prose-code': '#F5F5F5',
            '--tw-prose-pre-code': '#F5F5F5',
            '--tw-prose-pre-bg': '#1A1A1A',
            '--tw-prose-th-borders': '#1A1A1A',
            '--tw-prose-td-borders': '#1A1A1A',
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};