/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    '../../packages/ui/src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
  ],
  theme: {
    extend: {
      colors: {
        // Base system colors
        'primary-bg': '#111111',
        'text-light': '#F5F5F5',
        'text-dark': '#1A1A1A',
        'accent-blue': '#0072FF',
        'signal-green': '#00C853',
        
        // ULTRA Glassmorphism Color System 2025
        glass: {
          // Background variations
          'bg-ultra': 'rgba(255, 255, 255, 0.03)',
          'bg-light': 'rgba(255, 255, 255, 0.05)', 
          'bg-medium': 'rgba(255, 255, 255, 0.10)',
          'bg-strong': 'rgba(255, 255, 255, 0.15)',
          'bg-intense': 'rgba(255, 255, 255, 0.20)',
          
          // Border variations
          'border-subtle': 'rgba(255, 255, 255, 0.08)',
          'border-light': 'rgba(255, 255, 255, 0.12)',
          'border-medium': 'rgba(255, 255, 255, 0.20)',
          'border-strong': 'rgba(255, 255, 255, 0.30)',
          'border-glow': 'rgba(255, 255, 255, 0.40)',
        },
        
        // Enhanced gradient system
        gradient: {
          'cyber-blue': '#00d4ff',
          'cyber-purple': '#8b5cf6', 
          'cyber-pink': '#ec4899',
          'cyber-green': '#10b981',
          'cyber-orange': '#f59e0b',
          'neural-start': '#667eea',
          'neural-end': '#764ba2',
          'ai-primary': '#6366f1',
          'ai-secondary': '#8b5cf6',
        },
        
        // Interactive states
        interactive: {
          'hover-glow': 'rgba(99, 102, 241, 0.15)',
          'active-glow': 'rgba(99, 102, 241, 0.25)',
          'focus-ring': 'rgba(99, 102, 241, 0.35)',
        }
      },
      
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      
      // Enhanced backdrop blur system
      backdropBlur: {
        'ultra': '1px',
        'subtle': '2px', 
        'glass': '8px',
        'intense': '16px',
        'extreme': '24px',
      },
      
      // Advanced animation system
      animation: {
        // Existing animations
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.6s ease-out',
        'bounce-subtle': 'bounceSubtle 2s infinite',
        
        // ULTRA glassmorphism animations
        'glass-shimmer': 'glassShimmer 3s ease-in-out infinite',
        'float-gentle': 'floatGentle 4s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'morph-hover': 'morphHover 0.3s ease-out',
        'neural-pulse': 'neuralPulse 2.5s ease-in-out infinite',
        'cyber-scan': 'cyberScan 3s linear infinite',
        'glass-entrance': 'glassEntrance 0.8s ease-out',
        'depth-shift': 'depthShift 0.4s ease-out',
      },
      
      keyframes: {
        // Existing keyframes
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        bounceSubtle: {
          '0%, 20%, 50%, 80%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-5px)' },
          '60%': { transform: 'translateY(-3px)' },
        },
        
        // ULTRA glassmorphism keyframes
        glassShimmer: {
          '0%, 100%': { 
            background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)'
          },
          '50%': { 
            background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.1) 100%)'
          },
        },
        floatGentle: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(-10px) rotate(1deg)' },
        },
        glowPulse: {
          '0%, 100%': { 
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
          },
          '50%': { 
            boxShadow: '0 0 40px rgba(99, 102, 241, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)' 
          },
        },
        morphHover: {
          '0%': { 
            transform: 'scale(1) translateY(0px)',
            backdropFilter: 'blur(8px)',
          },
          '100%': { 
            transform: 'scale(1.02) translateY(-2px)',
            backdropFilter: 'blur(12px)',
          },
        },
        neuralPulse: {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        cyberScan: {
          '0%': { backgroundPosition: '200% 50%' },
          '100%': { backgroundPosition: '-200% 50%' },
        },
        glassEntrance: {
          '0%': { 
            opacity: '0',
            transform: 'translateY(30px) scale(0.95)',
            backdropFilter: 'blur(0px)',
          },
          '100%': { 
            opacity: '1',
            transform: 'translateY(0px) scale(1)',
            backdropFilter: 'blur(8px)',
          },
        },
        depthShift: {
          '0%': { 
            transform: 'translateZ(0px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          },
          '100%': { 
            transform: 'translateZ(10px)',
            boxShadow: '0 12px 24px rgba(0, 0, 0, 0.15)',
          },
        },
      },
      
      // Enhanced box shadow system
      boxShadow: {
        'glass-sm': '0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'glass': '0 4px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'glass-lg': '0 8px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        'glass-xl': '0 16px 48px rgba(0, 0, 0, 0.16), inset 0 2px 0 rgba(255, 255, 255, 0.2)',
        'glow-sm': '0 0 12px rgba(99, 102, 241, 0.15)',
        'glow': '0 0 24px rgba(99, 102, 241, 0.25)', 
        'glow-lg': '0 0 36px rgba(99, 102, 241, 0.35)',
        'neural': '0 0 40px rgba(102, 126, 234, 0.3), 0 0 80px rgba(118, 75, 162, 0.2)',
      },
      
      // Background patterns and gradients
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-pattern': 'linear-gradient(135deg, #111111 0%, #1a1a1a 100%)',
        'glass-pattern': 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
        'neural-grid': "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236366f1' fill-opacity='0.05'%3E%3Ccircle cx='7' cy='7' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        'cyber-mesh': 'linear-gradient(45deg, transparent 25%, rgba(99, 102, 241, 0.03) 25%, rgba(99, 102, 241, 0.03) 75%, transparent 75%), linear-gradient(-45deg, transparent 25%, rgba(139, 92, 246, 0.03) 25%, rgba(139, 92, 246, 0.03) 75%, transparent 75%)',
      },
    },
  },
  plugins: [],
};