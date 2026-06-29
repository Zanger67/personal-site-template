import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { isRouteEnabled } from '@config/site';
import profile from '../data/profile.json';

export async function GET(context: APIContext) {
  if (!isRouteEnabled('blog')) return new Response(null, { status: 404 });
  const posts = (await getCollection('blog'))
    .filter(post => !post.data.draft)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: `${profile.name} — Blog`,
    description: 'Dispatches from the hive.',
    site: context.site!,
    items: posts.map(post => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      link: `/blog/${post.id}/`,
    })),
  });
}
