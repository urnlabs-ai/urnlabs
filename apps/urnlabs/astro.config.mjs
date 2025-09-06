import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://www.urnlabs.ai',
  integrations: [
    react(),
    tailwind({
      configFile: './tailwind.config.mjs',
    }),
    mdx(),
    sitemap(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
  vite: {
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
        '~': new URL('./src', import.meta.url).pathname
      }
    },
    optimizeDeps: {
      include: ['@astrojs/mdx'],
    },
  },
});