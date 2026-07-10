# personal-site-template

A content-driven personal website template built with [Astro](https://astro.build/).
Almost everything on the site — pages, timeline, works, contact tree, map — is
generated from typed content collections and JSON data files, so building your own
site is mostly a matter of editing data, not components.

The demo content uses **Buzz** (Georgia Tech's mascot) as filler; swap in your own
data to make it yours.

## Tech stack

- **[Astro 6](https://astro.build/)** — static site generator, zero client JS by default
- **Content collections** with **Zod** schemas for typed markdown (`projects`, `blog`, `sections`)
- **[@astrojs/rss](https://docs.astro.build/en/guides/rss/)** for the blog feed
- Plain CSS (one global stylesheet, no framework)
- Deployed to **GitHub Pages** via GitHub Actions

## Getting started

```sh
npm install       # install dependencies
npm run dev       # start the dev server at http://localhost:4321
```

### Scripts (`package.json`)

| Command           | What it does                                              |
| ----------------- | -------------------------------------------------------- |
| `npm run dev`     | Start the local dev server with hot reload               |
| `npm run build`   | Type-check content collections and build to `dist/`      |
| `npm run preview` | Serve the built `dist/` locally to preview the production build |

> The site is served under a non-root base path (`/personal-site-template`), so
> local URLs are prefixed — e.g. `http://localhost:4321/personal-site-template/`.
> Change `base` in `astro.config.mjs` when forking (see [Configuration](#configuration)).

## Project structure

```
personal-site-template/
├── astro.config.mjs        # site URL, base path, markdown plugins, URL redirects
├── tsconfig.json           # strict TS + @config/* path alias
├── public/                 # static assets served as-is (favicon, robots.txt, llms.txt, images)
├── scripts/                # standalone dev tooling (see below)
└── src/
    ├── pages/              # routes — one file per URL
    ├── layouts/            # page shells wrapping content
    ├── components/         # reusable .astro components
    ├── content/            # markdown content collections
    ├── content.config.ts   # Zod schemas for the content collections
    ├── data/               # JSON data files that drive most of the site
    ├── config/             # site-wide visibility switchboard
    ├── utils/              # shared helper modules
    ├── styles/             # global.css
    └── dev/                # git-ignored scratch/archive/proofing area
```

### `src/pages/` — routes

| Route                    | File                          | Purpose                                              |
| ------------------------ | ----------------------------- | ---------------------------------------------------- |
| `/`                      | `index.astro`                 | Homepage — intro, highlights, sidebar                |
| `/works`                 | `works.astro`                 | Tabbed hub for Projects, Publications & Blog         |
| `/experience`            | `experience.astro`            | Gantt-style timeline + info-tab drawer               |
| `/contact`               | `contact.astro`               | Contact page (primary/sub link tree)                 |
| `/map`                   | `map.astro`                   | Places-visited map                                   |
| `/fun-facts`             | `fun-facts.astro`             | Fun facts list                                       |
| `/favourites`            | `favourites.astro`            | "Favourite internet corners" links                   |
| `/projects/<slug>`       | `projects/[...slug].astro`    | Per-project detail page                              |
| `/blog/<slug>`           | `blog/[...slug].astro`        | Per-post detail page                                 |
| `/rss.xml`               | `rss.xml.ts`                  | Blog RSS feed                                         |
| `404`                    | `404.astro`                   | Not-found page (also used to gate disabled routes)   |

### `src/layouts/`

- **`BaseLayout.astro`** — the outer shell (head, header, footer) every page uses.
- **`BlogPost.astro`** / **`ProjectPost.astro`** — detail-page layouts for blog posts and projects.

### `src/components/`

`Header`, `Footer`, `WorkCard` (project/publication/post card), `BackToWorks`
(tab/scroll-restoring back link), and the map pieces `NorthAmericaMap` / `MapleLeaf`.

## Content & data

The site is split between **markdown content collections** (long-form prose) and
**JSON data files** (structured lists). Most edits happen in `src/data/`.

### Content collections (`src/content/` + `src/content.config.ts`)

Three collections, each schema-validated at build time:

| Collection | Location                 | Notes                                                     |
| ---------- | ------------------------ | --------------------------------------------------------- |
| `projects` | `src/content/projects/`  | One `.md` per project; frontmatter drives Works + timeline |
| `blog`     | `src/content/blog/`      | One `.md` per post; feeds the Blog tab + RSS               |
| `sections` | `src/content/sections/`  | Free-form prose blocks (e.g. the homepage intro)          |

Shared frontmatter fields worth knowing:

- **`main`** — bubbles an item to the top of the Works tabs / timeline highlights.
- **`tags`** — chips shown on Works cards.
- **`affiliations`** — org strings that cross-link an item to that org on the timeline.
- **`collaborators`** / publication `authors` — name strings resolved against the
  people registry (`src/data/collaborators.json`) into links.
- **`relationGroups`** — free-form shared tags; items with the same slug relate to
  each other across the whole timeline (many-to-many).
- **`urls`** / **`features`** — extra links and "featured in" press links.

### Data files (`src/data/`)

| File                        | Drives                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `profile.json`              | Identity + homepage content (name, greeting, friends, meta)  |
| `organizations.json`        | Clubs/orgs with roles + membership windows                   |
| `affiliations.json`         | Experience orgs (roles, timeline windows, categories)        |
| `education.json`            | Education entries                                             |
| `publications.json`         | Publications list                                            |
| `awards.json`               | Awards                                                       |
| `certifications.json`       | Certifications (name, issuer, url, date)                     |
| `conferences.json`          | Conferences                                                  |
| `misc.json`                 | Misc. point-events on the timeline                           |
| `contacts.json`             | Contact-page primary/sub link tree                           |
| `collaborators.json`        | People registry — `slug → { display-name, url, urls }`       |
| `favourites.json`           | Favourite-internet-corners links                             |
| `fun-facts.json`            | Fun facts                                                    |
| `languages.json`            | Spoken/programming languages (homepage sidebar)              |
| `map-config.json` + `map-paths.ts` | Map page — visited places + SVG geometry              |
| `relationLabels.json`       | Org name → drawer tab label                                  |
| `relationGroupLabels.json`  | Relation-group slug → human label                            |

## Configuration

### Visibility switchboard — `src/config/site.ts` (`@config` alias)

The single source of truth for **what shows and what hides**. Instead of commenting
out code, flip a boolean:

- **`routes`** — each top-level page. A disabled route drops out of the nav *and*
  its page 404s when visited.
- **`footerLinks`** — footer links to render.
- **`homeSections`** — which homepage blocks appear.
- **`timeline.showIncoming`** — whether future-dated ("incoming") entries chart on the timeline.

### `astro.config.mjs`

- **`site`** / **`base`** — production origin and base path. Change `base` (or set it
  to `/`) when you fork.
- **`redirects`** — keeps old standalone URLs (`/timeline`, `/projects`,
  `/publications`, `/blog`) forwarding to their new homes (`/experience`, `/works#…`).
- **`markdown.rehypePlugins`** — `rehype-base-links` prefixes the `base` path onto
  root-relative links inside rendered markdown (Astro doesn't do this automatically).

### `src/utils/`

- **`collaborators.ts`** — `resolvePeople` / `slugify`; resolves name strings against the registry.
- **`links.ts`** — `KNOWN_HOSTS` + `hostLabel`; auto-labels links (github → GitHub, arxiv → arXiv, …).
- **`reading-time.ts`** — estimated read time for posts.
- **`rehype-base-links.mjs`** — the markdown base-link plugin used above.

## `src/dev/` — scratch, archive & proofing area

A **git-ignored** working area that mirrors `src/data/` and `src/content/`. Nothing
here is imported by the build or committed — only its `README.md` and `.gitkeep`
markers are tracked. Used to **archive** items pulled off the live site (kept for
possible reinstatement) or **proof** new items before promoting them. See
`src/dev/README.md` for details.

## `scripts/`

### `scripts/timeline-relations.py`

A read-only CLI that prints every **relation group** and **organisation** on the
`/experience` timeline and what belongs to each (roles, projects, publications,
awards, conferences, …) — i.e. the drawer's "Related" list and cross-links. It also
flags trouble: relation-group slugs that link to nothing, stale/missing labels, and
affiliation strings matching no known org (silently broken cross-links). It folds in
`src/dev/` archive/proofing items (tagged `⌂dev`) so you can preview how an
unreleased item would relate before promoting it.

```sh
python3 scripts/timeline-relations.py
```

Flags: `--repo personal|template|<path>`, `--no-archive`, `--json`. The same script
ships in the `personal-site` repo and inspects whichever repo it lives in by default.

## Deployment

`.github/workflows/deploy.yml` builds the site and publishes `dist/` to **GitHub
Pages** on every push to `main` (and via manual `workflow_dispatch`). Set the
repository's Pages source to "GitHub Actions" to enable it.
