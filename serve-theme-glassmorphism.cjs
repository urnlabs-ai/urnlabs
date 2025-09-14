const http = require('http');
const fs = require('fs');
const path = require('path');

// BULLETPROOF theme toggle implementation
const hotReloadScript = `
<style>
  /* BULLETPROOF THEME TOGGLE - Guaranteed Visible */
  #bulletproof-theme-toggle {
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    z-index: 999999 !important;
    
    /* Guaranteed visible dimensions */
    width: 60px !important;
    height: 60px !important;
    
    /* Solid, contrasting colors - NO transparency */
    background: #2563eb !important;
    color: white !important;
    
    /* Strong border definition */
    border: 3px solid #1e40af !important;
    border-radius: 50% !important;
    
    /* Typography */
    font-size: 28px !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    line-height: 1 !important;
    
    /* Layout */
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    
    /* Interaction */
    cursor: pointer !important;
    user-select: none !important;
    outline: none !important;
    
    /* NO backdrop-filter - causes invisibility */
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4) !important;
    
    /* Smooth transitions */
    transition: all 0.2s ease !important;
  }
  
  #bulletproof-theme-toggle:hover {
    background: #1d4ed8 !important;
    transform: scale(1.05) !important;
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5) !important;
  }
  
  #bulletproof-theme-toggle:active {
    transform: scale(0.95) !important;
    background: #1e40af !important;
  }
  
  /* Light theme variant */
  .theme-light #bulletproof-theme-toggle {
    background: #dc2626 !important;
    border-color: #b91c1c !important;
  }
  
  .theme-light #bulletproof-theme-toggle:hover {
    background: #b91c1c !important;
  }
</style>

<script>
  // BULLETPROOF Theme Management System
  const bulletproofThemeManager = {
    init() {
      this.createBulletproofToggle();
      this.loadTheme();
      this.startHotReload();
    },

    loadTheme() {
      const savedTheme = localStorage.getItem('theme-preference') || 'dark';
      this.setTheme(savedTheme, false);
    },

    setTheme(theme, save = true) {
      document.documentElement.className = 'theme-' + theme;
      document.documentElement.setAttribute('data-theme', theme);
      if (save) {
        localStorage.setItem('theme-preference', theme);
      }
      this.updateToggleButton(theme);
    },

    toggleTheme() {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      this.setTheme(newTheme);
    },

    createBulletproofToggle() {
      // Remove ALL existing theme buttons to prevent conflicts
      const existingButtons = document.querySelectorAll('[id*="theme"], [class*="theme-toggle"]');
      existingButtons.forEach(btn => btn.remove());
      
      // Create bulletproof button
      const button = document.createElement('button');
      button.id = 'bulletproof-theme-toggle';
      button.innerHTML = '🌙';
      button.setAttribute('aria-label', 'Toggle dark/light theme');
      button.onclick = () => this.toggleTheme();
      
      // Append with retry mechanism
      const appendButton = () => {
        if (document.body) {
          document.body.appendChild(button);
          console.log('✅ BULLETPROOF theme toggle created and guaranteed visible!');
          console.log('🎯 Button location: Top-right corner with bright blue background');
        } else {
          setTimeout(appendButton, 10);
        }
      };
      
      appendButton();
      return button;
    },

    updateToggleButton(theme) {
      const btn = document.getElementById('bulletproof-theme-toggle');
      if (btn) {
        btn.innerHTML = theme === 'dark' ? '🌙' : '☀️';
        btn.title = \`Switch to \${theme === 'dark' ? 'light' : 'dark'} theme\`;
      }
    },

    startHotReload() {
      let lastModified = '';
      setInterval(async () => {
        try {
          const response = await fetch(window.location.pathname, { method: 'HEAD' });
          const currentModified = response.headers.get('last-modified');
          if (lastModified && currentModified && lastModified !== currentModified) {
            window.location.reload();
          }
          lastModified = currentModified;
        } catch (e) {
          // Ignore errors
        }
      }, 1000);
    }
  };

  // Initialize immediately when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bulletproofThemeManager.init());
  } else {
    bulletproofThemeManager.init();
  }

  console.log('✨ BULLETPROOF theme system activated - buttons WILL be visible!');
</script>
`;

// Professional 2025 Color Systems with Universal Theme Support
const universalThemeCSS = `
  /* Universal Theme System */
  :root {
    --transition-theme: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Dark Theme (Default) - Professional 2025 Colors */
  .theme-dark {
    /* Neural AI Colors (usmanramzan.ai) */
    --neural-primary: #0B1426;
    --neural-secondary: #1E3A5F;
    --neural-accent: #00D4FF;
    --neural-gold: #FFB800;
    --neural-glass-bg: linear-gradient(135deg, #0B1426 0%, #1E3A5F 35%, #2D5A87 100%);
    --neural-surface: rgba(11, 20, 38, 0.25);
    --neural-border: rgba(255, 255, 255, 0.18);
    --neural-shadow: 0 8px 32px rgba(0, 0, 0, 0.37);
    --neural-glow: rgba(0, 212, 255, 0.4);
    
    /* Enterprise AI Colors (urnlabs.ai) */
    --enterprise-primary: #00296B;
    --enterprise-secondary: #003F88;
    --enterprise-accent: #00509D;
    --enterprise-gold: #FDC500;
    --enterprise-glass-bg: linear-gradient(135deg, #00296B 0%, #003F88 40%, #00509D 100%);
    --enterprise-surface: rgba(0, 41, 107, 0.20);
    --enterprise-border: rgba(253, 197, 0, 0.20);
    --enterprise-shadow: 0 12px 40px rgba(0, 41, 107, 0.25);
    --enterprise-glow: rgba(253, 197, 0, 0.3);
    
    /* DevOps Colors (eprecisio.com) */
    --devops-primary: #0F172A;
    --devops-secondary: #1E293B;
    --devops-accent: #0EA5E9;
    --devops-success: #10B981;
    --devops-warning: #F59E0B;
    --devops-glass-bg: linear-gradient(135deg, #0F172A 0%, #1E293B 40%, #334155 100%);
    --devops-surface: rgba(15, 23, 42, 0.25);
    --devops-border: rgba(148, 163, 184, 0.20);
    --devops-shadow: 0 10px 35px rgba(15, 23, 42, 0.30);
    --devops-glow: rgba(14, 165, 233, 0.3);
    
    /* Universal Dark Theme Variables */
    --bg-primary: var(--neural-glass-bg);
    --bg-secondary: var(--enterprise-glass-bg);
    --bg-tertiary: var(--devops-glass-bg);
    --glass-bg: rgba(255, 255, 255, 0.05);
    --glass-border: rgba(255, 255, 255, 0.1);
    --glass-shadow: rgba(31, 38, 135, 0.37);
    --text-primary: #FFFFFF;
    --text-secondary: #B8C5D1;
    --text-muted: #7A8B99;
    --accent-blue: var(--neural-accent);
    --accent-purple: #8B5FBF;
    --accent-green: var(--devops-success);
    --accent-orange: var(--devops-warning);
  }

  /* Light Theme - Professional 2025 Light Variants */
  .theme-light {
    /* Neural AI Light Colors */
    --neural-primary: #E8F4FD;
    --neural-secondary: #D1E7F7;
    --neural-accent: #0099CC;
    --neural-gold: #CC9400;
    --neural-glass-bg: linear-gradient(135deg, #E8F4FD 0%, #D1E7F7 35%, #B8D9F1 100%);
    --neural-surface: rgba(232, 244, 253, 0.25);
    --neural-border: rgba(0, 0, 0, 0.18);
    --neural-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    --neural-glow: rgba(0, 153, 204, 0.3);
    
    /* Enterprise AI Light Colors */
    --enterprise-primary: #F8F9FA;
    --enterprise-secondary: #E9ECEF;
    --enterprise-accent: #00509D;
    --enterprise-gold: #B8860B;
    --enterprise-glass-bg: linear-gradient(135deg, #F8F9FA 0%, #E9ECEF 40%, #DEE2E6 100%);
    --enterprise-surface: rgba(248, 249, 250, 0.30);
    --enterprise-border: rgba(0, 41, 107, 0.15);
    --enterprise-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
    --enterprise-glow: rgba(184, 134, 11, 0.3);
    
    /* DevOps Light Colors */
    --devops-primary: #F1F5F9;
    --devops-secondary: #E2E8F0;
    --devops-accent: #0369A1;
    --devops-success: #047857;
    --devops-warning: #D97706;
    --devops-glass-bg: linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 40%, #CBD5E1 100%);
    --devops-surface: rgba(241, 245, 249, 0.30);
    --devops-border: rgba(15, 23, 42, 0.15);
    --devops-shadow: 0 10px 35px rgba(0, 0, 0, 0.08);
    --devops-glow: rgba(3, 105, 161, 0.2);
    
    /* Universal Light Theme Variables */
    --bg-primary: var(--neural-glass-bg);
    --bg-secondary: var(--enterprise-glass-bg);
    --bg-tertiary: var(--devops-glass-bg);
    --glass-bg: rgba(255, 255, 255, 0.7);
    --glass-border: rgba(0, 0, 0, 0.1);
    --glass-shadow: rgba(0, 0, 0, 0.1);
    --text-primary: #0B1426;
    --text-secondary: #2D5A87;
    --text-muted: #5A6B78;
    --accent-blue: var(--neural-accent);
    --accent-purple: #8B5FBF;
    --accent-green: var(--devops-success);
    --accent-orange: var(--devops-warning);
  }

  /* Theme Toggle Button */
  .theme-toggle {
    position: fixed;
    top: 70px;
    right: 20px;
    width: 50px;
    height: 50px;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    z-index: 10000;
    transition: var(--transition-theme);
    backdrop-filter: blur(20px);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px var(--glass-shadow);
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
  }

  .theme-toggle:hover {
    transform: scale(1.1) rotate(10deg);
    box-shadow: 0 6px 25px var(--glass-shadow);
  }

  .toggle-icon {
    position: relative;
    width: 24px;
    height: 24px;
    font-size: 20px;
  }

  .sun-icon, .moon-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    transition: var(--transition-theme);
  }

  .theme-dark .sun-icon {
    opacity: 0;
    transform: translate(-50%, -50%) rotate(180deg) scale(0.5);
  }

  .theme-dark .moon-icon {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(0deg) scale(1);
  }

  .theme-light .sun-icon {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(0deg) scale(1);
  }

  .theme-light .moon-icon {
    opacity: 0;
    transform: translate(-50%, -50%) rotate(-180deg) scale(0.5);
  }

  /* Universal Glassmorphism Classes */
  .glassmorphism {
    background: var(--glass-bg);
    backdrop-filter: blur(20px);
    border: 1px solid var(--glass-border);
    border-radius: 20px;
    box-shadow: 0 8px 32px var(--glass-shadow);
    transition: var(--transition-theme);
  }

  .glassmorphism-strong {
    background: var(--glass-bg);
    backdrop-filter: blur(25px);
    border: 1px solid var(--glass-border);
    border-radius: 16px;
    box-shadow: 0 8px 32px var(--glass-shadow);
    transition: var(--transition-theme);
  }

  /* Site-Specific Glassmorphism Classes */
  .glassmorphism-neural {
    background: var(--neural-surface);
    backdrop-filter: blur(12px) saturate(180%);
    border: 1px solid var(--neural-border);
    border-radius: 16px;
    box-shadow: var(--neural-shadow);
    transition: var(--transition-theme);
  }

  .glassmorphism-enterprise {
    background: var(--enterprise-surface);
    backdrop-filter: blur(16px) saturate(200%);
    border: 1px solid var(--enterprise-border);
    border-radius: 12px;
    box-shadow: var(--enterprise-shadow);
    transition: var(--transition-theme);
  }

  .glassmorphism-devops {
    background: var(--devops-surface);
    backdrop-filter: blur(14px) saturate(190%);
    border: 1px solid var(--devops-border);
    border-radius: 10px;
    box-shadow: var(--devops-shadow);
    transition: var(--transition-theme);
  }

  /* Universal Text Classes */
  .text-theme-primary { color: var(--text-primary); transition: var(--transition-theme); }
  .text-theme-secondary { color: var(--text-secondary); transition: var(--transition-theme); }
  .text-theme-muted { color: var(--text-muted); transition: var(--transition-theme); }

  /* Theme-aware backgrounds */
  .bg-theme-primary { background: var(--bg-primary); transition: var(--transition-theme); }
  .bg-theme-secondary { background: var(--bg-secondary); transition: var(--transition-theme); }
  .bg-theme-tertiary { background: var(--bg-tertiary); transition: var(--transition-theme); }

  /* Dev Indicator Theme-aware */
  .dev-indicator {
    position: fixed;
    top: 10px;
    right: 10px;
    background: linear-gradient(45deg, var(--accent-green), var(--accent-blue));
    color: white;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    z-index: 9999;
    box-shadow: 0 4px 6px var(--glass-shadow);
    backdrop-filter: blur(8px);
    transition: var(--transition-theme);
  }
`;

// Enhanced glassmorphism templates with theme support
function createUsmanRamzanDesign() {
  return `<!DOCTYPE html>
<html lang="en" class="theme-dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Usman Ramzan AI - Neural Network Portfolio</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    ${universalThemeCSS}
    
    /* Neural Network Specific Styles - Enhanced 2025 */
    body { 
      margin: 0; 
      background: var(--neural-glass-bg);
      min-height: 100vh; 
      font-family: 'Inter', sans-serif; 
      overflow-x: hidden;
      transition: var(--transition-theme);
    }
    
    .neural-bg {
      background: radial-gradient(circle at 20% 50%, var(--neural-glow) 0%, transparent 50%),
                  radial-gradient(circle at 80% 20%, var(--neural-glow) 0%, transparent 50%),
                  radial-gradient(circle at 40% 80%, var(--neural-glow) 0%, transparent 50%);
    }
    
    @keyframes neural-pulse {
      0%, 100% { opacity: 0.3; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.1); }
    }
    .neural-node {
      animation: neural-pulse 3s ease-in-out infinite;
      animation-delay: var(--delay);
      transition: var(--transition-theme);
    }
    
    @keyframes float {
      0%, 100% { transform: translateY(0px) rotate(0deg); }
      33% { transform: translateY(-10px) rotate(120deg); }
      66% { transform: translateY(10px) rotate(240deg); }
    }
    .floating-shape {
      animation: float 6s ease-in-out infinite;
      animation-delay: var(--delay);
      transition: var(--transition-theme);
    }
    
    .gradient-text {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #4facfe 100%);
      background-size: 300% 300%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: gradient-shift 4s ease infinite;
    }
    
    @keyframes gradient-shift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }

    /* Theme-specific neural nodes - 2025 Professional Colors */
    .theme-dark .neural-node-blue { background-color: var(--neural-accent); }
    .theme-dark .neural-node-purple { background-color: #8B5FBF; }
    .theme-dark .neural-node-pink { background-color: #FF4081; }
    .theme-dark .neural-node-cyan { background-color: var(--neural-accent); }
    .theme-dark .neural-node-green { background-color: #00C896; }
    .theme-dark .neural-node-gold { background-color: var(--neural-gold); }

    .theme-light .neural-node-blue { background-color: var(--neural-accent); }
    .theme-light .neural-node-purple { background-color: #8B5FBF; }
    .theme-light .neural-node-pink { background-color: #FF4081; }
    .theme-light .neural-node-cyan { background-color: var(--neural-accent); }
    .theme-light .neural-node-green { background-color: #00C896; }
    .theme-light .neural-node-gold { background-color: var(--neural-gold); }

    /* Theme-specific borders */
    .theme-dark .border-blue { border-color: #60a5fa; }
    .theme-dark .border-purple { border-color: #a78bfa; }
    .theme-dark .border-pink { border-color: #f472b6; }

    .theme-light .border-blue { border-color: #3b82f6; }
    .theme-light .border-purple { border-color: #8b5cf6; }
    .theme-light .border-pink { border-color: #ec4899; }
  </style>
  ${hotReloadScript}
</head>
<body class="neural-bg bg-theme-primary">
  <div class="dev-indicator">🎨 NEURAL GLASSMORPHISM</div>
  
  <!-- Bulletproof theme toggle is created via JavaScript -->
  
  <!-- Neural Network Background -->
  <div class="fixed inset-0 overflow-hidden pointer-events-none z-0">
    <div class="neural-node neural-node-blue absolute top-20 left-20 w-4 h-4 rounded-full" style="--delay: 0s;"></div>
    <div class="neural-node neural-node-purple absolute top-40 right-32 w-3 h-3 rounded-full" style="--delay: 0.5s;"></div>
    <div class="neural-node neural-node-pink absolute bottom-32 left-40 w-5 h-5 rounded-full" style="--delay: 1s;"></div>
    <div class="neural-node neural-node-cyan absolute bottom-20 right-20 w-3 h-3 rounded-full" style="--delay: 1.5s;"></div>
    <div class="neural-node neural-node-green absolute top-60 left-1/2 w-4 h-4 rounded-full" style="--delay: 2s;"></div>
    <div class="neural-node neural-node-gold absolute top-1/3 right-1/4 w-3 h-3 rounded-full" style="--delay: 2.5s;"></div>
    
    <!-- Floating Geometric Shapes -->
    <div class="floating-shape absolute top-32 right-40 w-12 h-12 border-2 border-blue rotate-45" style="--delay: 0s;"></div>
    <div class="floating-shape absolute bottom-40 left-32 w-8 h-8 border-2 border-purple rounded-full" style="--delay: 2s;"></div>
    <div class="floating-shape absolute top-1/2 right-16 w-10 h-10 border-2 border-pink" style="--delay: 4s;"></div>
  </div>

  <!-- Main Content -->
  <div class="relative z-10 min-h-screen flex items-center justify-center p-8">
    <div class="glassmorphism p-12 max-w-6xl w-full text-center">
      <!-- Header -->
      <nav class="glassmorphism-neural p-4 mb-12 flex justify-between items-center">
        <span class="font-semibold text-xl text-theme-primary">usmanramzan.ai</span>
        <div class="flex space-x-6">
          <a href="#about" class="text-theme-muted hover:text-blue-400 transition-colors">About</a>
          <a href="#skills" class="text-theme-muted hover:text-blue-400 transition-colors">Skills</a>
          <a href="#projects" class="text-theme-muted hover:text-blue-400 transition-colors">Projects</a>
          <a href="#contact" class="text-theme-muted hover:text-blue-400 transition-colors">Contact</a>
        </div>
      </nav>

      <!-- Hero Section -->
      <div class="mb-16">
        <h1 class="text-7xl font-black mb-6 gradient-text">
          Muhammad Usman Ramzan
        </h1>
        <p class="text-2xl text-theme-secondary mb-4 font-light">
          Co-founder & CTO at <span class="text-orange-400 font-semibold">ePrecisio</span> | 
          CEO & Founder at <span class="text-green-400 font-semibold">URNLabs.ai</span>
        </p>
        <p class="text-xl text-theme-muted mb-8">
          Infrastructure Engineer • Kubernetes Expert • CKAD Certified • AI Enthusiast
        </p>
        <div class="glassmorphism p-6 text-theme-secondary leading-relaxed max-w-4xl mx-auto">
          <p>With 5+ years of infrastructure engineering expertise, I specialize in transforming enterprise systems through 
          <strong class="text-blue-400">Kubernetes orchestration</strong>, <strong class="text-purple-400">cloud migration</strong>, 
          and <strong class="text-pink-400">DevOps automation</strong>. Currently managing 
          <strong class="text-cyan-400">300+ Kubernetes nodes</strong> across multi-cloud environments at Unifonic.</p>
        </div>
      </div>

      <!-- Skills Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        <div class="glassmorphism-neural p-6">
          <div class="text-4xl mb-4">⚙️</div>
          <h3 class="text-xl font-bold text-theme-primary mb-3">Infrastructure Engineering</h3>
          <p class="text-theme-muted">Kubernetes, Docker, OCI OKE, AWS EKS, multi-cloud architecture</p>
        </div>
        <div class="glassmorphism-neural p-6">
          <div class="text-4xl mb-4">☁️</div>
          <h3 class="text-xl font-bold text-theme-primary mb-3">Cloud Migration</h3>
          <p class="text-theme-muted">40+ applications migrated, 20+ database servers, cost optimization</p>
        </div>
        <div class="glassmorphism-neural p-6">
          <div class="text-4xl mb-4">🤖</div>
          <h3 class="text-xl font-bold text-theme-primary mb-3">AI & Automation</h3>
          <p class="text-theme-muted">DevOps automation, AI-powered workflows, enterprise solutions</p>
        </div>
      </div>

      <!-- Contact Section -->
      <div class="glassmorphism-neural p-8">
        <h2 class="text-3xl font-bold text-theme-primary mb-6">Let's Connect</h2>
        <div class="flex justify-center space-x-8">
          <a href="https://linkedin.com/in/muhammadusmanramzan" target="_blank" 
             class="text-blue-400 hover:text-blue-300 transition-colors font-semibold">
            LinkedIn
          </a>
          <a href="https://github.com/muhammadusmanramzan" target="_blank" 
             class="text-purple-400 hover:text-purple-300 transition-colors font-semibold">
            GitHub
          </a>
          <a href="mailto:contact@usmanramzan.ai" 
             class="text-green-400 hover:text-green-300 transition-colors font-semibold">
            Email
          </a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function createEPrecisioDesign() {
  return `<!DOCTYPE html>
<html lang="en" class="theme-dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EPrecisio - DevOps Consulting & Infrastructure Excellence</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    ${universalThemeCSS}
    
    /* DevOps Specific Styles - Enhanced 2025 */
    body { 
      margin: 0; 
      background: var(--devops-glass-bg);
      min-height: 100vh; 
      font-family: 'Inter', sans-serif; 
      overflow-x: hidden;
      transition: var(--transition-theme);
    }
    
    .devops-bg {
      background: radial-gradient(circle at 15% 30%, var(--devops-glow) 0%, transparent 50%),
                  radial-gradient(circle at 85% 20%, var(--devops-glow) 0%, transparent 50%),
                  radial-gradient(circle at 50% 80%, var(--devops-glow) 0%, transparent 50%);
    }
    
    @keyframes server-pulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.05); }
    }
    .server-node {
      animation: server-pulse 2.5s ease-in-out infinite;
      animation-delay: var(--delay);
      transition: var(--transition-theme);
    }
    
    @keyframes infra-float {
      0%, 100% { transform: translateY(0px) rotate(0deg); }
      25% { transform: translateY(-8px) rotate(90deg); }
      50% { transform: translateY(0px) rotate(180deg); }
      75% { transform: translateY(8px) rotate(270deg); }
    }
    .infrastructure-shape {
      animation: infra-float 8s ease-in-out infinite;
      animation-delay: var(--delay);
      transition: var(--transition-theme);
    }
    
    .gradient-text-devops {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 25%, #06b6d4 50%, #10b981 75%, #f59e0b 100%);
      background-size: 300% 300%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: gradient-shift 5s ease infinite;
    }
    
    @keyframes gradient-shift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }

    /* Theme-specific server nodes - 2025 Professional DevOps Colors */
    .theme-dark .server-blue { background-color: var(--devops-accent); }
    .theme-dark .server-purple { background-color: #8B5CF6; }
    .theme-dark .server-green { background-color: var(--devops-success); }
    .theme-dark .server-orange { background-color: var(--devops-warning); }
    .theme-dark .server-cyan { background-color: var(--devops-accent); }
    .theme-dark .server-compute { background-color: #7C3AED; }
    .theme-dark .server-storage { background-color: #DC2626; }
    .theme-dark .server-network { background-color: var(--devops-accent); }

    .theme-light .server-blue { background-color: var(--devops-accent); }
    .theme-light .server-purple { background-color: #8B5CF6; }
    .theme-light .server-green { background-color: var(--devops-success); }
    .theme-light .server-orange { background-color: var(--devops-warning); }
    .theme-light .server-cyan { background-color: var(--devops-accent); }
    .theme-light .server-compute { background-color: #7C3AED; }
    .theme-light .server-storage { background-color: #DC2626; }
    .theme-light .server-network { background-color: var(--devops-accent); }

    /* Theme-specific borders for infrastructure shapes */
    .theme-dark .infra-border-blue { border-color: #60a5fa; }
    .theme-dark .infra-border-purple { border-color: #a78bfa; }
    .theme-dark .infra-border-green { border-color: #34d399; }

    .theme-light .infra-border-blue { border-color: #3b82f6; }
    .theme-light .infra-border-purple { border-color: #8b5cf6; }
    .theme-light .infra-border-green { border-color: #10b981; }
  </style>
  ${hotReloadScript}
</head>
<body class="devops-bg bg-theme-secondary">
  <div class="dev-indicator">🎨 DEVOPS GLASSMORPHISM</div>
  
  <!-- Bulletproof theme toggle is created via JavaScript -->
  
  <!-- Infrastructure Background -->
  <div class="fixed inset-0 overflow-hidden pointer-events-none z-0">
    <!-- Server Nodes -->
    <div class="server-node server-blue absolute top-24 left-16 w-5 h-5 rounded" style="--delay: 0s;"></div>
    <div class="server-node server-purple absolute top-32 right-24 w-4 h-4 rounded" style="--delay: 0.3s;"></div>
    <div class="server-node server-green absolute bottom-40 left-32 w-6 h-6 rounded" style="--delay: 0.6s;"></div>
    <div class="server-node server-orange absolute bottom-24 right-16 w-4 h-4 rounded" style="--delay: 0.9s;"></div>
    <div class="server-node server-cyan absolute top-1/2 left-20 w-5 h-5 rounded" style="--delay: 1.2s;"></div>
    
    <!-- Infrastructure Shapes -->
    <div class="infrastructure-shape absolute top-40 right-32 w-16 h-16 border-2 infra-border-blue rounded-lg" style="--delay: 0s;"></div>
    <div class="infrastructure-shape absolute bottom-32 left-24 w-12 h-12 border-2 infra-border-purple rounded-full" style="--delay: 3s;"></div>
    <div class="infrastructure-shape absolute top-1/3 right-20 w-14 h-14 border-2 infra-border-green" style="--delay: 6s;"></div>
  </div>

  <!-- Main Content -->
  <div class="relative z-10 min-h-screen">
    <!-- Navigation -->
    <nav class="glassmorphism-devops m-6 p-4 flex justify-between items-center">
      <h2 class="text-2xl font-bold text-theme-primary">EPrecisio</h2>
      <div class="flex space-x-8">
        <a href="#services" class="text-theme-muted hover:text-blue-400 transition-colors">Services</a>
        <a href="#expertise" class="text-theme-muted hover:text-blue-400 transition-colors">Expertise</a>
        <a href="#clients" class="text-theme-muted hover:text-blue-400 transition-colors">Clients</a>
        <a href="#contact" class="text-theme-muted hover:text-blue-400 transition-colors">Contact</a>
      </div>
    </nav>

    <!-- Hero Section -->
    <div class="flex items-center justify-center min-h-screen p-8">
      <div class="glassmorphism p-16 max-w-7xl w-full text-center">
        <h1 class="text-8xl font-black mb-8 gradient-text-devops">
          EPrecisio
        </h1>
        <p class="text-3xl text-theme-secondary mb-6 font-light">
          DevOps Consulting & Infrastructure Excellence
        </p>
        <p class="text-xl text-theme-muted mb-12 max-w-4xl mx-auto leading-relaxed">
          Transform your infrastructure with enterprise-grade DevOps solutions. 
          From Kubernetes orchestration to multi-cloud migrations, we deliver scalable, 
          secure, and cost-optimized infrastructure that powers your business growth.
        </p>

        <!-- Services Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <div class="glassmorphism-devops p-6">
            <div class="text-5xl mb-4">☸️</div>
            <h3 class="text-lg font-bold text-theme-primary mb-3">Kubernetes</h3>
            <p class="text-theme-muted text-sm">Container orchestration, scaling, and management</p>
          </div>
          <div class="glassmorphism-devops p-6">
            <div class="text-5xl mb-4">☁️</div>
            <h3 class="text-lg font-bold text-theme-primary mb-3">Cloud Migration</h3>
            <p class="text-theme-muted text-sm">AWS, OCI, multi-cloud architecture</p>
          </div>
          <div class="glassmorphism-devops p-6">
            <div class="text-5xl mb-4">🔒</div>
            <h3 class="text-lg font-bold text-theme-primary mb-3">Security</h3>
            <p class="text-theme-muted text-sm">Infrastructure security and compliance</p>
          </div>
          <div class="glassmorphism-devops p-6">
            <div class="text-5xl mb-4">📊</div>
            <h3 class="text-lg font-bold text-theme-primary mb-3">Monitoring</h3>
            <p class="text-theme-muted text-sm">Performance monitoring and optimization</p>
          </div>
        </div>

        <!-- Client Showcase -->
        <div class="glassmorphism-devops p-8 mb-16">
          <h2 class="text-4xl font-bold text-theme-primary mb-6">Trusted by Leading Organizations</h2>
          <p class="text-theme-muted mb-8">
            We've successfully delivered infrastructure transformations for enterprises worldwide, 
            managing 300+ Kubernetes nodes and migrating 40+ applications across multi-cloud environments.
          </p>
          <div class="flex justify-center space-x-12 text-2xl font-bold text-theme-muted">
            <span>Unifonic</span>
            <span>•</span>
            <span>Enterprise Clients</span>
            <span>•</span>
            <span>Global Partners</span>
          </div>
        </div>

        <!-- CTA Section -->
        <div class="glassmorphism-devops p-8">
          <h2 class="text-3xl font-bold text-theme-primary mb-4">Ready to Transform Your Infrastructure?</h2>
          <p class="text-theme-muted mb-6">Let's discuss how we can optimize your DevOps processes and scale your systems.</p>
          <div class="flex justify-center space-x-6">
            <button class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors">
              Get Consultation
            </button>
            <button class="border border-gray-400 hover:border-gray-300 text-theme-muted hover:text-theme-primary font-semibold py-3 px-8 rounded-lg transition-colors">
              View Case Studies
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function createURNLabsDesign() {
  return `<!DOCTYPE html>
<html lang="en" class="theme-dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>URNLabs - Agents that ship work</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    ${universalThemeCSS}
    
    /* URNLabs Specific Styles - Enhanced 2025 Enterprise */
    body { 
      margin: 0; 
      background: var(--enterprise-glass-bg);
      min-height: 100vh; 
      font-family: 'Inter', sans-serif; 
      overflow-x: hidden;
      transition: var(--transition-theme);
    }
    
    .urnlabs-bg {
      background: radial-gradient(circle at 25% 25%, var(--enterprise-glow) 0%, transparent 50%),
                  radial-gradient(circle at 75% 75%, var(--enterprise-glow) 0%, transparent 50%);
    }
    
    .gradient-text-urnlabs {
      background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-green) 100%);
      background-size: 300% 300%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: gradient-shift 3s ease infinite;
    }
    
    @keyframes gradient-shift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }

    /* Enhanced buttons for theme compatibility */
    .btn-primary {
      background: var(--accent-blue);
      color: white;
      padding: 0.75rem 2rem;
      border-radius: 0.5rem;
      font-weight: 600;
      transition: var(--transition-theme);
      border: none;
      cursor: pointer;
    }
    
    .btn-primary:hover {
      background: var(--accent-purple);
      transform: translateY(-2px);
      box-shadow: 0 4px 20px var(--glass-shadow);
    }
    
    .btn-secondary {
      background: transparent;
      color: var(--text-primary);
      padding: 0.75rem 2rem;
      border: 1px solid var(--glass-border);
      border-radius: 0.5rem;
      font-weight: 600;
      transition: var(--transition-theme);
      cursor: pointer;
    }
    
    .btn-secondary:hover {
      background: var(--glass-bg);
      transform: translateY(-2px);
    }
  </style>
  ${hotReloadScript}
</head>
<body class="urnlabs-bg bg-theme-tertiary">
  <div class="dev-indicator">🎨 URNLABS GLASSMORPHISM</div>
  
  <!-- Bulletproof theme toggle is created via JavaScript -->
  
  <!-- Main Content -->
  <div class="relative z-10 min-h-screen">
    <!-- Hero Section -->
    <section class="relative overflow-hidden">
      <div class="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
        <div class="mx-auto max-w-4xl text-center">
          <h1 class="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl text-theme-primary">
            Agents that
            <span class="gradient-text-urnlabs">ship work</span>
          </h1>
          <p class="mx-auto mt-6 max-w-2xl text-lg leading-8 text-theme-muted sm:text-xl">
            Build deterministic AI workflows with governance-first approach. 
            Transform your operations with measurable ROI and enterprise-grade security.
          </p>
          <div class="mt-10 flex items-center justify-center gap-x-6">
            <button class="btn-primary">Book Discovery</button>
            <button class="btn-secondary">Learn more →</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Value Props Section -->
    <section class="py-24 sm:py-32">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl text-theme-primary">
            Built for Enterprise
          </h2>
          <p class="mt-6 text-lg leading-8 text-theme-muted">
            Three core principles that set us apart from other AI solutions
          </p>
        </div>
        <div class="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <div class="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            <div class="glassmorphism-enterprise p-8">
              <div class="flex items-center gap-x-3 text-base font-semibold leading-7">
                <div class="h-10 w-10 flex items-center justify-center rounded-lg" style="background-color: var(--enterprise-accent);">
                  <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <span class="text-theme-primary">Deterministic Flows</span>
              </div>
              <div class="mt-4 text-base leading-7 text-theme-muted">
                <p>Predictable, repeatable workflows with clear audit trails. No black box magic, just reliable automation.</p>
              </div>
            </div>

            <div class="glassmorphism-enterprise p-8">
              <div class="flex items-center gap-x-3 text-base font-semibold leading-7">
                <div class="h-10 w-10 flex items-center justify-center rounded-lg" style="background-color: var(--enterprise-gold);">
                  <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <span class="text-theme-primary">Governance First</span>
              </div>
              <div class="mt-4 text-base leading-7 text-theme-muted">
                <p>Built-in policy enforcement, access controls, and compliance features. Security and governance from day one.</p>
              </div>
            </div>

            <div class="glassmorphism-enterprise p-8">
              <div class="flex items-center gap-x-3 text-base font-semibold leading-7">
                <div class="h-10 w-10 flex items-center justify-center rounded-lg" style="background-color: var(--enterprise-secondary);"
                  <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l-1-3m1 3l-1-3m-16.5-3h16.5"></path>
                  </svg>
                </div>
                <span class="text-theme-primary">Measured ROI</span>
              </div>
              <div class="mt-4 text-base leading-7 text-theme-muted">
                <p>Track every task, measure every outcome. Clear metrics on cost savings and efficiency gains.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-24">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div class="glassmorphism-enterprise p-16 text-center">
          <h2 class="text-4xl font-bold text-theme-primary mb-6">Ready to Ship Work with AI Agents?</h2>
          <p class="text-xl text-theme-muted mb-8 max-w-3xl mx-auto">
            Join leading enterprises who've transformed their operations with deterministic AI workflows.
          </p>
          <div class="flex justify-center space-x-6">
            <button class="btn-primary">Start Building</button>
            <button class="btn-secondary">Schedule Demo</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</body>
</html>`;
}

function serveStaticFile(filePath, res, siteName) {
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(createNotFoundPage(siteName));
      return;
    }

    let html = content;
    const devIndicator = '<div class="dev-indicator">🎨 THEME GLASSMORPHISM</div>';
    const themeEnhancer = `
      <style>
        ${universalThemeCSS}
        html { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        body { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
      </style>
      <script>
        document.documentElement.className = 'theme-dark';
        document.documentElement.setAttribute('data-theme', 'dark');
      </script>
    `;
    
    html = html.replace('</head>', `  ${themeEnhancer}\n  ${hotReloadScript}\n</head>`);
    html = html.replace('<body', `<body`);
    html = html.replace('>', `>\n  ${devIndicator}`);

    const stats = fs.statSync(filePath);
    res.writeHead(200, { 
      'Content-Type': 'text/html',
      'Last-Modified': stats.mtime.toUTCString()
    });
    res.end(html);
  });
}

function createNotFoundPage(siteName) {
  return `<!DOCTYPE html>
<html class="theme-dark">
<head>
  <title>Not Found - \${siteName}</title>
  <style>
    \${universalThemeCSS}
    body { 
      margin: 0; background: var(--bg-tertiary);
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', sans-serif;
    }
    .error-container {
      background: var(--glass-bg); backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border); border-radius: 20px;
      box-shadow: 0 8px 32px var(--glass-shadow); padding: 2rem; text-align: center;
    }
  </style>
  ${hotReloadScript}
</head>
<body>
  <div class="dev-indicator">🎨 THEME GLASSMORPHISM 404</div>
  <div class="error-container">
    <h1 class="text-theme-primary" style="font-size: 2.5rem; margin-bottom: 1rem;">404 - Not Found</h1>
    <p class="text-theme-secondary" style="font-size: 1.2rem;">${siteName}</p>
  </div>
</body>
</html>`;
}

function createServer(port, siteName, worktreePath) {
  const distPath = path.join(worktreePath, 'dist');

  const server = http.createServer((req, res) => {
    let requestedPath = req.url === '/' ? '/index.html' : req.url;
    
    // Handle static assets from dist folder
    if (req.url.startsWith('/assets/') || req.url.startsWith('/_astro/')) {
      const assetPath = path.join(distPath, req.url);
      if (fs.existsSync(assetPath)) {
        const ext = path.extname(assetPath);
        const mimeTypes = {
          '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png',
          '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
          '.woff2': 'font/woff2', '.woff': 'font/woff'
        };
        const stats = fs.statSync(assetPath);
        res.writeHead(200, { 
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Last-Modified': stats.mtime.toUTCString()
        });
        fs.createReadStream(assetPath).pipe(res);
        return;
      }
    }
    
    // Priority 1: Enhanced theme-aware designs
    if (requestedPath === '/index.html' || requestedPath === '/') {
      console.log(`🎨 Serving theme-enabled glassmorphism for: ${siteName}`);
      let html;
      if (siteName === 'usmanramzan.ai') {
        html = createUsmanRamzanDesign();
      } else if (siteName === 'eprecisio.com') {
        html = createEPrecisioDesign();
      } else if (siteName === 'urnlabs.ai') {
        // Check for built files first, fallback to theme-enabled template
        const staticFilePath = path.join(distPath, 'index.html');
        if (fs.existsSync(staticFilePath)) {
          console.log(`🎨 Serving enhanced built file: ${staticFilePath}`);
          serveStaticFile(staticFilePath, res, siteName);
          return;
        } else {
          html = createURNLabsDesign();
        }
      }
      
      if (html) {
        res.writeHead(200, { 
          'Content-Type': 'text/html',
          'Last-Modified': new Date().toUTCString()
        });
        res.end(html);
        return;
      }
    }
    
    // Priority 2: Built static files with theme enhancement
    const staticFilePath = path.join(distPath, requestedPath);
    if (fs.existsSync(staticFilePath) && staticFilePath.endsWith('.html')) {
      console.log(`🎨 Serving theme-enhanced static file: ${staticFilePath}`);
      serveStaticFile(staticFilePath, res, siteName);
      return;
    }
    
    // 404
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(createNotFoundPage(siteName));
  });

  server.listen(port, () => {
    console.log(`🎨 ${siteName}: http://localhost:${port} (theme glassmorphism)`);
  });
  
  return server;
}

// Site configurations
const sites = [
  { port: 8001, name: 'usmanramzan.ai', path: './worktrees/usmanramzan-ai' },
  { port: 8002, name: 'urnlabs.ai', path: './worktrees/urnlabs-ai' },
  { port: 8003, name: 'eprecisio.com', path: './worktrees/eprecisio-com' }
];

console.log('🎨 Starting Theme-Enabled Glassmorphism Development Servers...\\n');

const runningServers = [];
sites.forEach(({ port, name, path: sitePath }) => {
  const server = createServer(port, name, sitePath);
  runningServers.push(server);
});

console.log('\\n✨ All theme-enabled glassmorphism servers started!');
console.log('🎯 usmanramzan.ai: Neural network with dark/light themes');
console.log('🎯 urnlabs.ai: Professional design with theme toggle');  
console.log('🎯 eprecisio.com: DevOps infrastructure with theme support');
console.log('🌙 Dark/Light theme toggle available on all sites');
console.log('🔥 Hot reload enabled with theme persistence');

process.on('SIGINT', () => {
  console.log('\\n🛑 Shutting down theme-enabled glassmorphism servers...');
  runningServers.forEach(server => server.close());
  process.exit(0);
});