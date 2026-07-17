// Builds a schema.org JSON-LD @graph describing the site owner — a Person node
// (work history, memberships, education, awards, social profiles) plus WebSite,
// CreativeWork (projects), and ScholarlyArticle (publications) nodes. Emitted in
// the homepage <head>/body so crawlers and LLMs get the full identity + timeline
// context without it having to be visually rendered. Pure/data-driven: the same
// mechanism runs in both repos; only the underlying data differs.
//
// Work/membership history uses schema.org's Role reification (an OrganizationRole
// carrying startDate/endDate and repeating the relating property — worksFor /
// memberOf — around the actual Organization), so each role keeps its dates.

import { resolvePeople } from './collaborators';

interface ProjectLike {
  id: string;
  data: Record<string, any>;
}

export interface GraphInput {
  /** Absolute site origin (+ base), no trailing slash, e.g. "https://zang.dev". */
  siteUrl: string;
  profile: Record<string, any>;
  affiliations: any[];
  organizations: any[];
  education: any[];
  awards: any[];
  publications: any[];
  projects: ProjectLike[];
  /** Absolute URLs of external social/profile links (schema.org sameAs). */
  socials: string[];
}

function orgNode(org: any): object {
  return {
    '@type': 'Organization',
    name: org.organization,
    ...(org.url ? { url: org.url } : {}),
  };
}

// One OrganizationRole per role (plus a blanket "Member" role when the org has a
// membership window but no explicit roles). `relProp` is repeated inside the Role
// per schema.org's Role pattern so the dated role still points at the org.
function orgRoles(org: any, relProp: 'worksFor' | 'memberOf'): object[] {
  const nodes: object[] = [];
  for (const r of org.roles ?? []) {
    nodes.push({
      '@type': 'OrganizationRole',
      roleName: r.roleDetail || r.role,
      ...(r.start ? { startDate: r.start } : {}),
      ...(r.end ? { endDate: r.end } : {}),
      [relProp]: orgNode(org),
    });
  }
  if (org.membership && !(org.roles ?? []).length) {
    nodes.push({
      '@type': 'OrganizationRole',
      roleName: 'Member',
      ...(org.membership.start ? { startDate: org.membership.start } : {}),
      ...(org.membership.end ? { endDate: org.membership.end } : {}),
      [relProp]: orgNode(org),
    });
  }
  return nodes;
}

function isoDate(d: any): string | undefined {
  if (!d) return undefined;
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.valueOf()) ? undefined : date.toISOString().slice(0, 10);
}

export function buildPersonGraph(input: GraphInput): object {
  const { siteUrl, profile, affiliations, organizations, education, awards, publications, projects, socials } = input;
  const personId = `${siteUrl}/#person`;
  const author = { '@id': personId };

  // Currently-held titles = affiliation roles with no end date.
  const jobTitle = affiliations
    .flatMap((o: any) => (o.roles ?? []).filter((r: any) => !r.end).map((r: any) => r.roleDetail || r.role));

  // Education → deduped institutions (alumniOf) + one credential per degree.
  const alumniOf: object[] = [];
  const seenInstitutions = new Set<string>();
  for (const ed of education) {
    if (!ed.institution || seenInstitutions.has(ed.institution)) continue;
    seenInstitutions.add(ed.institution);
    alumniOf.push({ '@type': 'CollegeOrUniversity', name: ed.institution, ...(ed.url ? { url: ed.url } : {}) });
  }
  const hasCredential = education
    .filter((ed: any) => ed.degree)
    .map((ed: any) => ({
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'degree',
      name: ed.degree,
      ...(ed.institution ? { recognizedBy: { '@type': 'CollegeOrUniversity', name: ed.institution } } : {}),
    }));

  const person: Record<string, any> = {
    '@type': 'Person',
    '@id': personId,
    name: profile.fullName || profile.name,
    ...(profile.fullName && profile.fullName !== profile.name ? { alternateName: profile.name } : {}),
    url: `${siteUrl}/`,
    ...(profile.profileImage ? { image: `${siteUrl}${profile.profileImage}` } : {}),
    ...(profile.description ? { description: profile.description } : {}),
    ...(jobTitle.length ? { jobTitle } : {}),
    ...(socials.length ? { sameAs: socials } : {}),
    ...(Array.isArray(profile.knowsAbout) && profile.knowsAbout.length ? { knowsAbout: profile.knowsAbout } : {}),
    ...(affiliations.length ? { worksFor: affiliations.flatMap((o: any) => orgRoles(o, 'worksFor')) } : {}),
    ...(organizations.length ? { memberOf: organizations.flatMap((o: any) => orgRoles(o, 'memberOf')) } : {}),
    ...(alumniOf.length ? { alumniOf } : {}),
    ...(hasCredential.length ? { hasCredential } : {}),
    ...(awards.length ? { award: awards.map((a: any) => a.name).filter(Boolean) } : {}),
  };

  const website = {
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    url: `${siteUrl}/`,
    name: profile.name,
    ...(profile.description ? { description: profile.description } : {}),
    about: { '@id': personId },
  };

  const projectNodes = projects.map((p) => {
    const d = p.data;
    const url = `${siteUrl}/projects/${p.id}`;
    return {
      '@type': d.repo ? 'SoftwareSourceCode' : 'CreativeWork',
      '@id': url,
      name: d.title,
      ...(d.description ? { description: d.description } : {}),
      url,
      ...(isoDate(d.startDate) ? { dateCreated: isoDate(d.startDate) } : {}),
      ...(d.repo ? { codeRepository: d.repo } : {}),
      author,
    };
  });

  const pubNodes = publications.map((pub: any) => {
    const people = resolvePeople(pub.authors);
    const authorValue = people.length
      ? people.map((a) => ({ '@type': 'Person', name: a.name, ...(a.url ? { url: a.url } : {}) }))
      : author;
    const link = pub.url || (Array.isArray(pub.urls) && pub.urls[0]?.url) || undefined;
    return {
      '@type': 'ScholarlyArticle',
      name: pub.title,
      ...(link ? { url: link } : {}),
      ...(pub.date ? { datePublished: String(pub.date) } : {}),
      author: authorValue,
      ...(pub.venue ? { isPartOf: { '@type': 'Periodical', name: pub.venue } } : {}),
    };
  });

  return {
    '@context': 'https://schema.org',
    '@graph': [person, website, ...projectNodes, ...pubNodes],
  };
}
