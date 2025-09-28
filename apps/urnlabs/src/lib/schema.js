export function getOrganizationSchema({ name, url, logo, sameAs, description, foundingDate, address, }) {
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
export function getBlogPostSchema({ headline, description, image, datePublished, dateModified, author, publisher, }) {
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
export function getPersonSchema({ name, url, jobTitle, affiliation, sameAs, }) {
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
//# sourceMappingURL=schema.js.map