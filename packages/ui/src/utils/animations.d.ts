/**
 * Animation utilities and presets for Framer Motion
 */
import type { Variants, Transition } from 'framer-motion';
export declare const transitions: {
    fast: Transition;
    normal: Transition;
    slow: Transition;
    bounce: Transition;
    spring: Transition;
};
export declare const fadeInUp: Variants;
export declare const fadeInDown: Variants;
export declare const fadeIn: Variants;
export declare const scaleIn: Variants;
export declare const slideInLeft: Variants;
export declare const slideInRight: Variants;
export declare const buttonHover: Variants;
export declare const cardHover: Variants;
export declare const modalBackdrop: Variants;
export declare const modal: Variants;
export declare const drawer: Variants;
export declare const toast: Variants;
export declare const staggerContainer: Variants;
export declare const staggerItem: Variants;
export declare const pageTransition: Variants;
export declare function createStagger(delay?: number): {
    animate: {
        transition: {
            staggerChildren: number;
        };
    };
};
export declare function createFadeInStagger(delay?: number): {
    container: {
        animate: {
            transition: {
                staggerChildren: number;
            };
        };
    };
    item: Variants;
};
//# sourceMappingURL=animations.d.ts.map