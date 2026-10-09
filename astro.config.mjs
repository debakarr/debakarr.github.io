import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://debakarr.github.io',
  integrations: [mdx(), sitemap()],
  // Tags merged into their plural or correctly spelled forms.
  redirects: {
    '/tags/algorithm': '/tags/algorithms',
    '/tags/array': '/tags/arrays',
    '/tags/string': '/tags/strings',
    '/tags/best-practice': '/tags/best-practices',
    '/tags/best-pactice': '/tags/best-practices',
    '/tags/comparision': '/tags/comparison',
    '/categories/best-pactice': '/categories/best-practices',
    '/games/wildborn': '/lumiquest/',
    '/games/lumiquest': '/lumiquest/',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark-default',
      },
      defaultColor: false,
    },
  },
});
