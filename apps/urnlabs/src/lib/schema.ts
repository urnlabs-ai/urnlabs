export interface OrganizationSchema {
  name: string;
  url: string;
  logo: string;
  sameAs: string[];
  description?: string;
  foundingDate?: string;
  address?: {
    '@type': 'PostalAddress';
    addressCountry: string;
    addressRegion?: string;
    addressLocality?: string;
  };
}

export interface BlogPostSchema {
  headline: string;
  description: string;
  image: string;
  datePublished: string;
  dateModified: string;
  author: {
    '@type': 'Person';
    name: string;
    url?: string;
  };
  publisher: OrganizationSchema;
}

export function getOrganizationSchema({
  name,
  url,
  logo,
  sameAs,
  description,
  foundingDate,
  address,
}: OrganizationSchema) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url,
    logo,
    sameAs,
    ...(description && { description }),
    ...(foundingDate && { foundingDate }),
    ...(address && { address }),
  };
}

export function getBlogPostSchema({
  headline,
  description,
  image,
  datePublished,
  dateModified,
  author,
  publisher,
}: BlogPostSchema) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline,
    description,
    image,
    datePublished,
    dateModified,
    author,
    publisher: getOrganizationSchema(publisher),
  };
}

export function getPersonSchema({
  name,
  url,
  jobTitle,
  affiliation,
  sameAs,
}: {
  name: string;
  url: string;
  jobTitle: string;
  affiliation: { '@type': 'Organization'; name: string };
  sameAs: string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    url,
    jobTitle,
    affiliation,
    sameAs,
  };
}