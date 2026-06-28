import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    draft: z.boolean().optional().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    url: z.string().optional(),
    repo: z.string().optional(),
    tags: z.array(z.string()).optional().default([]),
    // Tags linking project to an experience/role (e.g. lab name, employer)
    affiliations: z.array(z.string()).optional().default([]),
    // TODO: publications should also support affiliations (partner orgs, labs)
    // Timeline cross-links: `slug` is a stable handle other timeline items can
    // point at; `related` lists slugs this project links to. Links are made
    // bidirectional in the timeline, so only one side needs to declare them.
    slug: z.string().optional(),
    related: z.array(z.string()).optional().default([]),
    pinned: z.boolean().optional().default(false),
    // Cross-cutting "main"/highlights flag — surfaced by the timeline's Main filter.
    main: z.boolean().optional().default(false),
    order: z.number().optional().default(0),
  }),
});

export const collections = { blog, projects };
