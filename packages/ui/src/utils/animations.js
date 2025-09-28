/**
 * Animation utilities and presets for Framer Motion
 */
// Standard transitions
export const transitions = {
    fast: { duration: 0.15, ease: 'easeOut' },
    normal: { duration: 0.25, ease: 'easeOut' },
    slow: { duration: 0.4, ease: 'easeOut' },
    bounce: { type: 'spring', damping: 15, stiffness: 300 },
    spring: { type: 'spring', damping: 20, stiffness: 300 },
};
// Common animation variants
export const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
};
export const fadeInDown = {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
};
export const fadeIn = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};
export const scaleIn = {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 },
};
export const slideInLeft = {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
};
export const slideInRight = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
};
// Component-specific animations
export const buttonHover = {
    rest: { scale: 1 },
    hover: { scale: 1.02 },
    tap: { scale: 0.98 },
};
export const cardHover = {
    rest: { y: 0, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
    hover: {
        y: -4,
        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        transition: transitions.fast,
    },
};
export const modalBackdrop = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};
export const modal = {
    initial: { opacity: 0, scale: 0.9, y: 20 },
    animate: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: transitions.spring,
    },
    exit: {
        opacity: 0,
        scale: 0.9,
        y: 20,
        transition: transitions.fast,
    },
};
export const drawer = {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
};
export const toast = {
    initial: { opacity: 0, y: 50, scale: 0.3 },
    animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: transitions.spring,
    },
    exit: {
        opacity: 0,
        scale: 0.5,
        transition: transitions.fast,
    },
};
// Staggered animations for lists
export const staggerContainer = {
    animate: {
        transition: {
            staggerChildren: 0.1,
        },
    },
};
export const staggerItem = {
    initial: { opacity: 0, y: 20 },
    animate: {
        opacity: 1,
        y: 0,
        transition: transitions.normal,
    },
};
// Page transitions
export const pageTransition = {
    initial: { opacity: 0, x: 20 },
    animate: {
        opacity: 1,
        x: 0,
        transition: transitions.normal,
    },
    exit: {
        opacity: 0,
        x: -20,
        transition: transitions.fast,
    },
};
// Utility functions
export function createStagger(delay = 0.1) {
    return {
        animate: {
            transition: {
                staggerChildren: delay,
            },
        },
    };
}
export function createFadeInStagger(delay = 0.1) {
    return {
        container: createStagger(delay),
        item: fadeInUp,
    };
}
//# sourceMappingURL=animations.js.map