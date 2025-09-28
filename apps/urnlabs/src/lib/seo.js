export function getSEO({ title, description, url, image = '/assets/og-image.jpg', type = 'website', siteName = 'Urnlabs', publishedTime, modifiedTime, }) {
    const fullImageUrl = image.startsWith('http') ? image : `https://www.urnlabs.ai${image}`;
    return {
        title,
        description,
        canonical: url,
        openGraph: {
            basic: {
                title,
                type,
                image: fullImageUrl,
                url,
            },
            optional: {
                description,
                siteName,
                ...(publishedTime && { publishedTime }),
                ...(modifiedTime && { modifiedTime }),
            },
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            image: fullImageUrl,
        },
    };
}
export function formatPageTitle(title, siteName = 'Urnlabs') {
    return title === siteName ? siteName : `${title} | ${siteName}`;
}
//# sourceMappingURL=seo.js.map