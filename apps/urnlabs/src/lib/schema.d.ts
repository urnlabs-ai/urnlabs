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
export declare function getOrganizationSchema({ name, url, logo, sameAs, description, foundingDate, address, }: OrganizationSchema): {
    address?: {
        '@type': "PostalAddress";
        addressCountry: string;
        addressRegion?: string;
        addressLocality?: string;
    };
    foundingDate?: string;
    description?: string;
    '@context': string;
    '@type': string;
    name: string;
    url: string;
    logo: string;
    sameAs: string[];
};
export declare function getBlogPostSchema({ headline, description, image, datePublished, dateModified, author, publisher, }: BlogPostSchema): {
    '@context': string;
    '@type': string;
    headline: string;
    description: string;
    image: string;
    datePublished: string;
    dateModified: string;
    author: {
        '@type': "Person";
        name: string;
        url?: string;
    };
    publisher: {
        address?: {
            '@type': "PostalAddress";
            addressCountry: string;
            addressRegion?: string;
            addressLocality?: string;
        };
        foundingDate?: string;
        description?: string;
        '@context': string;
        '@type': string;
        name: string;
        url: string;
        logo: string;
        sameAs: string[];
    };
};
export declare function getPersonSchema({ name, url, jobTitle, affiliation, sameAs, }: {
    name: string;
    url: string;
    jobTitle: string;
    affiliation: {
        '@type': 'Organization';
        name: string;
    };
    sameAs: string[];
}): {
    '@context': string;
    '@type': string;
    name: string;
    url: string;
    jobTitle: string;
    affiliation: {
        '@type': "Organization";
        name: string;
    };
    sameAs: string[];
};
//# sourceMappingURL=schema.d.ts.map