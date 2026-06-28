import { defineConfig } from 'astro/config';

const base = '/personal-site-template';

export default defineConfig({
  site: 'https://zanger67.github.io',
  base,
  // The Timeline now lives as a view inside /experience; keep the old URL alive.
  // (redirect destinations are not base-prefixed automatically, so do it here.)
  redirects: {
    '/timeline': `${base}/experience`,
  },
});
