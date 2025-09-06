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

export function getSEO({
  title,
  description,
  url,
  image = '/assets/og-image.jpg',
  type = 'website',
  siteName = 'Usman Ramzan',
  publishedTime,
  modifiedTime,
}: SEOProps) {
  const fullImageUrl = image.startsWith('http') ? image : `https://www.usmanramzan.ai${image}`;
  
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

export function formatPageTitle(title: string, siteName = 'Usman Ramzan'): string {
  return title === siteName ? siteName : `${title} | ${siteName}`;
}