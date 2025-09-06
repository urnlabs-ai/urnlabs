module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      url: [
        'http://localhost/index.html',
        'http://localhost/platform/index.html',
        'http://localhost/pricing/index.html',
        'http://localhost/contact/index.html',
      ],
    },
    assert: {
      preset: 'lighthouse:recommended',
      assertions: {
        // Core Web Vitals thresholds
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 1800 }],
        
        // Performance thresholds
        'speed-index': ['warn', { maxNumericValue: 3000 }],
        'interactive': ['warn', { maxNumericValue: 3500 }],
        
        // Best practices
        'uses-https': 'error',
        'uses-http2': 'warn',
        'viewport': 'error',
        
        // SEO
        'document-title': 'error',
        'meta-description': 'error',
        'crawlable-anchors': 'error',
        
        // Accessibility
        'color-contrast': 'error',
        'heading-order': 'warn',
        'link-name': 'error',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};