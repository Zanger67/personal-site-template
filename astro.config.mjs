import { defineConfig } from 'astro/config';
import rehypeBaseLinks from './src/utils/rehype-base-links.mjs';

const base = '/personal-site-template';

export default defineConfig({
  site: 'https://zanger67.github.io',
  base,
  // Prefix BASE_URL onto root-relative links inside rendered markdown — Astro
  // doesn't do this automatically, so section/blog/project prose links would
  // otherwise 404 under a non-root `base`.
  markdown: {
    rehypePlugins: [[rehypeBaseLinks, { base }]],
  },
  // The Timeline now lives as a view inside /experience; keep the old URL alive.
  // (redirect destinations are not base-prefixed automatically, so do it here.)
  // Projects/Publications/Blog listings merged into the tabbed /works page —
  // forward the old standalone URLs to the matching tab. (Detail pages like
  // /projects/<slug> and /blog/<slug> are unaffected.)
  redirects: {
    '/timeline': `${base}/experience`,
    '/projects': `${base}/works#projects`,
    '/publications': `${base}/works#publications`,
    '/blog': `${base}/works#blog`,
  },
});
