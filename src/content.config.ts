import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// The "urls" listed format: extra links surfaced as info-tab buttons (and blog
// post header buttons), appended after an entry's main `url`/`repo`. A button
// shows its `title`; with none, it falls back to the URL's host label
// (e.g. "https://www.github.com/foo/bar" → "github"). See hostLabel/extraLinks
// in experience.astro. Shared by every entity that can carry extra links.
const urlEntry = z.object({
  title: z.string().optional(),
  url: z.string(),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    draft: z.boolean().optional().default(false),
    // Cross-cutting "main"/highlights flag — bubbles the post to the top of the
    // Works tabs (same flag projects & publications use).
    main: z.boolean().optional().default(false),
    // Topic tags — rendered as chips on the Works cards, same as projects.
    tags: z.array(z.string()).optional().default([]),
    // Your role/authorship on the post (e.g. "Guest author"). Shown as the italic
    // subtitle on Works cards and under the title on the post page. Omit for a
    // standard solo post.
    role: z.string().nullable().optional(),
    // Orgs/labs this post is affiliated with — displayed as chips on the Works
    // card and post header (the same affiliation tag projects & publications carry).
    affiliations: z.array(z.string()).optional().default([]),
    // Collaborators / co-authors — raw name strings, resolved via
    // src/data/collaborators.json into clickable links on the post page (same
    // mechanism as a project's `collaborators` / a publication's `authors`).
    collaborators: z.array(z.string()).optional().default([]),
    // Extra links rendered as buttons in the post header.
    urls: z.array(urlEntry).optional().default([]),
    // "Featured in" / press coverage — a list parallel to `urls`, same shape,
    // rendered as its own set of buttons after them.
    features: z.array(urlEntry).optional().default([]),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // Your role on the project (e.g. "Co-Creator & Maintainer"). Surfaced as the
    // subtitle on Works cards + the timeline drawer, and under the title on the
    // project detail page. Omit for solo/unlabelled projects.
    role: z.string().nullable().optional(),
    startDate: z.coerce.date(),
    // Optional scalars are .nullable() so personal-site items can carry explicit
    // `null` placeholders (see the "fully-explicit" data convention in CLAUDE.md);
    // null reads the same as omitted. endDate MUST be nullable — a bare
    // z.coerce.date() would coerce null into a bogus 1970 date.
    endDate: z.coerce.date().nullable().optional(),
    url: z.string().nullable().optional(),
    repo: z.string().nullable().optional(),
    // Extra info-tab links beyond `url`/`repo` (see urlEntry above).
    urls: z.array(urlEntry).optional().default([]),
    // "Featured in" / press coverage — a list parallel to `urls`, same shape,
    // rendered as its own set of buttons after them.
    features: z.array(urlEntry).optional().default([]),
    tags: z.array(z.string()).optional().default([]),
    // Tags linking project to an experience/role (e.g. lab name, employer).
    // Displayed as affiliation chips on Works cards / detail pages, and cross-links
    // the project to that org on the timeline. Publications (publications.json) and
    // blog posts carry the same field.
    affiliations: z.array(z.string()).optional().default([]),
    // Collaborators / co-authors — raw name strings. Synonymous with a
    // publication's `authors` (both resolve the same way). Each name is looked up
    // by EXACT match in src/data/collaborators.json; a matched name carrying a
    // `url` renders as a clickable link on the detail page, others as plain text.
    collaborators: z.array(z.string()).optional().default([]),
    // Timeline relation-groups: a shared free-form tag that groups items across
    // the whole timeline. Selecting any item highlights every item that shares
    // one of its relation-groups (independent of category/org). Many-to-many —
    // give items the same tag and they group; no per-pair linking needed.
    relationGroups: z.array(z.string()).optional().default([]),
    pinned: z.boolean().optional().default(false),
    // Cross-cutting "main"/highlights flag — surfaced by the timeline's Main filter.
    main: z.boolean().optional().default(false),
    order: z.number().optional().default(0),
  }),
});

// Free-form prose blocks rendered into pages (e.g. the homepage intro).
// Body is markdown; inline links render normally. One file per section.
const sections = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/sections' }),
  schema: z.object({
    title: z.string().optional(),
  }),
});

export const collections = { blog, projects, sections };
