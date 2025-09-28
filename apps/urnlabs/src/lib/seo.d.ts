export interface SEOProps {
    title: string;
    description: string;
    url: string;
    image?: string;
    type?: 'website' | 'article';
    siteName?: string;
    publishedTime?: string;
    modifiedTime?: string;
}
export declare function getSEO({ title, description, url, image, type, siteName, publishedTime, modifiedTime, }: SEOProps): {
    title: string;
    description: string;
    canonical: string;
    openGraph: {
        basic: {
            title: string;
            type: "website" | "article";
            image: string;
            url: string;
        };
        optional: {
            modifiedTime?: string;
            publishedTime?: string;
            description: string;
            siteName: string;
        };
    };
    twitter: {
        card: string;
        title: string;
        description: string;
        image: string;
    };
};
export declare function formatPageTitle(title: string, siteName?: string): string;
//# sourceMappingURL=seo.d.ts.map