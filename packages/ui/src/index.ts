// Export all components
export { default as Button } from './components/Button.astro';
export { default as Hero } from './components/Hero.astro';
export { default as FeatureGrid } from './components/FeatureGrid.astro';
export { default as CTA } from './components/CTA.astro';

// Export types
export type { Props as ButtonProps } from './components/Button.astro';
export type { Props as HeroProps } from './components/Hero.astro';
export type { Props as FeatureGridProps, Feature } from './components/FeatureGrid.astro';
export type { Props as CTAProps } from './components/CTA.astro';