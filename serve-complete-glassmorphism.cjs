const http = require('http');
const fs = require('fs');
const path = require('path');

// Hot reload script
const hotReloadScript = `
<script>
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
  
  console.log('🎨 Complete Glassmorphism hot reload active');
</script>
`;

// Enhanced glassmorphism templates for each site
function createUsmanRamzanDesign() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Usman Ramzan AI - Neural Network Portfolio</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    body { 
      margin: 0; 
      background: linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 25%, #16213e 50%, #0f3460 75%, #533483 100%);
      min-height: 100vh; font-family: 'Inter', sans-serif; overflow-x: hidden;
    }
    .glassmorphism {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
    }
    .neural-bg {
      background: radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
                  radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%),
                  radial-gradient(circle at 40% 80%, rgba(120, 219, 255, 0.3) 0%, transparent 50%);
    }
    .dev-indicator { 
      position: fixed; top: 10px; right: 10px; 
      background: linear-gradient(45deg, #22c55e, #3b82f6); color: white; 
      padding: 8px 12px; border-radius: 8px; font-size: 12px; z-index: 9999;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3); backdrop-filter: blur(8px);
    }
    @keyframes neural-pulse {
      0%, 100% { opacity: 0.3; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.1); }
    }
    .neural-node {
      animation: neural-pulse 3s ease-in-out infinite;
      animation-delay: var(--delay);
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px) rotate(0deg); }
      33% { transform: translateY(-10px) rotate(120deg); }
      66% { transform: translateY(10px) rotate(240deg); }
    }
    .floating-shape {
      animation: float 6s ease-in-out infinite;
      animation-delay: var(--delay);
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
  </style>
  ${hotReloadScript}
</head>
<body class="neural-bg">
  <div class="dev-indicator">🎨 NEURAL GLASSMORPHISM</div>
  
  <!-- Neural Network Background -->
  <div class="fixed inset-0 overflow-hidden pointer-events-none z-0">
    <div class="neural-node absolute top-20 left-20 w-4 h-4 bg-blue-400 rounded-full" style="--delay: 0s;"></div>
    <div class="neural-node absolute top-40 right-32 w-3 h-3 bg-purple-400 rounded-full" style="--delay: 0.5s;"></div>
    <div class="neural-node absolute bottom-32 left-40 w-5 h-5 bg-pink-400 rounded-full" style="--delay: 1s;"></div>
    <div class="neural-node absolute bottom-20 right-20 w-3 h-3 bg-cyan-400 rounded-full" style="--delay: 1.5s;"></div>
    <div class="neural-node absolute top-60 left-1/2 w-4 h-4 bg-green-400 rounded-full" style="--delay: 2s;"></div>
    
    <!-- Floating Geometric Shapes -->
    <div class="floating-shape absolute top-32 right-40 w-12 h-12 border-2 border-blue-300 rotate-45" style="--delay: 0s;"></div>
    <div class="floating-shape absolute bottom-40 left-32 w-8 h-8 border-2 border-purple-300 rounded-full" style="--delay: 2s;"></div>
    <div class="floating-shape absolute top-1/2 right-16 w-10 h-10 border-2 border-pink-300" style="--delay: 4s;"></div>
  </div>

  <!-- Main Content -->
  <div class="relative z-10 min-h-screen flex items-center justify-center p-8">
    <div class="glassmorphism p-12 max-w-6xl w-full text-center">
      <!-- Header -->
      <nav class="glassmorphism p-4 mb-12 flex justify-between items-center">
        <span class="font-semibold text-xl text-white">usmanramzan.ai</span>
        <div class="flex space-x-6">
          <a href="#about" class="text-gray-300 hover:text-blue-400 transition-colors">About</a>
          <a href="#skills" class="text-gray-300 hover:text-blue-400 transition-colors">Skills</a>
          <a href="#projects" class="text-gray-300 hover:text-blue-400 transition-colors">Projects</a>
          <a href="#contact" class="text-gray-300 hover:text-blue-400 transition-colors">Contact</a>
        </div>
      </nav>

      <!-- Hero Section -->
      <div class="mb-16">
        <h1 class="text-7xl font-black mb-6 gradient-text">
          Muhammad Usman Ramzan
        </h1>
        <p class="text-2xl text-gray-200 mb-4 font-light">
          Co-founder & CTO at <span class="text-orange-400 font-semibold">ePrecisio</span> | 
          CEO & Founder at <span class="text-green-400 font-semibold">URNLabs.ai</span>
        </p>
        <p class="text-xl text-gray-300 mb-8">
          Infrastructure Engineer • Kubernetes Expert • CKAD Certified • AI Enthusiast
        </p>
        <div class="glassmorphism p-6 text-gray-200 leading-relaxed max-w-4xl mx-auto">
          <p>With 5+ years of infrastructure engineering expertise, I specialize in transforming enterprise systems through 
          <strong class="text-blue-400">Kubernetes orchestration</strong>, <strong class="text-purple-400">cloud migration</strong>, 
          and <strong class="text-pink-400">DevOps automation</strong>. Currently managing 
          <strong class="text-cyan-400">300+ Kubernetes nodes</strong> across multi-cloud environments at Unifonic.</p>
        </div>
      </div>

      <!-- Skills Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        <div class="glassmorphism p-6">
          <div class="text-4xl mb-4">⚙️</div>
          <h3 class="text-xl font-bold text-white mb-3">Infrastructure Engineering</h3>
          <p class="text-gray-300">Kubernetes, Docker, OCI OKE, AWS EKS, multi-cloud architecture</p>
        </div>
        <div class="glassmorphism p-6">
          <div class="text-4xl mb-4">☁️</div>
          <h3 class="text-xl font-bold text-white mb-3">Cloud Migration</h3>
          <p class="text-gray-300">40+ applications migrated, 20+ database servers, cost optimization</p>
        </div>
        <div class="glassmorphism p-6">
          <div class="text-4xl mb-4">🤖</div>
          <h3 class="text-xl font-bold text-white mb-3">AI & Automation</h3>
          <p class="text-gray-300">DevOps automation, AI-powered workflows, enterprise solutions</p>
        </div>
      </div>

      <!-- Contact Section -->
      <div class="glassmorphism p-8">
        <h2 class="text-3xl font-bold text-white mb-6">Let's Connect</h2>
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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EPrecisio - DevOps Consulting & Infrastructure Excellence</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    body { 
      margin: 0; 
      background: linear-gradient(135deg, #0c1426 0%, #1e3a8a 25%, #3730a3 50%, #581c87 75%, #7c2d12 100%);
      min-height: 100vh; font-family: 'Inter', sans-serif; overflow-x: hidden;
    }
    .glassmorphism {
      background: rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(25px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(31, 38, 135, 0.4);
    }
    .devops-bg {
      background: radial-gradient(circle at 15% 30%, rgba(59, 130, 246, 0.3) 0%, transparent 50%),
                  radial-gradient(circle at 85% 20%, rgba(168, 85, 247, 0.3) 0%, transparent 50%),
                  radial-gradient(circle at 50% 80%, rgba(34, 197, 94, 0.3) 0%, transparent 50%);
    }
    .dev-indicator { 
      position: fixed; top: 10px; right: 10px; 
      background: linear-gradient(45deg, #f97316, #3b82f6); color: white; 
      padding: 8px 12px; border-radius: 8px; font-size: 12px; z-index: 9999;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3); backdrop-filter: blur(8px);
    }
    @keyframes server-pulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.05); }
    }
    .server-node {
      animation: server-pulse 2.5s ease-in-out infinite;
      animation-delay: var(--delay);
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
  </style>
  ${hotReloadScript}
</head>
<body class="devops-bg">
  <div class="dev-indicator">🎨 DEVOPS GLASSMORPHISM</div>
  
  <!-- Infrastructure Background -->
  <div class="fixed inset-0 overflow-hidden pointer-events-none z-0">
    <!-- Server Nodes -->
    <div class="server-node absolute top-24 left-16 w-5 h-5 bg-blue-500 rounded" style="--delay: 0s;"></div>
    <div class="server-node absolute top-32 right-24 w-4 h-4 bg-purple-500 rounded" style="--delay: 0.3s;"></div>
    <div class="server-node absolute bottom-40 left-32 w-6 h-6 bg-green-500 rounded" style="--delay: 0.6s;"></div>
    <div class="server-node absolute bottom-24 right-16 w-4 h-4 bg-orange-500 rounded" style="--delay: 0.9s;"></div>
    <div class="server-node absolute top-1/2 left-20 w-5 h-5 bg-cyan-500 rounded" style="--delay: 1.2s;"></div>
    
    <!-- Infrastructure Shapes -->
    <div class="infrastructure-shape absolute top-40 right-32 w-16 h-16 border-2 border-blue-400 rounded-lg" style="--delay: 0s;"></div>
    <div class="infrastructure-shape absolute bottom-32 left-24 w-12 h-12 border-2 border-purple-400 rounded-full" style="--delay: 3s;"></div>
    <div class="infrastructure-shape absolute top-1/3 right-20 w-14 h-14 border-2 border-green-400" style="--delay: 6s;"></div>
  </div>

  <!-- Main Content -->
  <div class="relative z-10 min-h-screen">
    <!-- Navigation -->
    <nav class="glassmorphism m-6 p-4 flex justify-between items-center">
      <h2 class="text-2xl font-bold text-white">EPrecisio</h2>
      <div class="flex space-x-8">
        <a href="#services" class="text-gray-300 hover:text-blue-400 transition-colors">Services</a>
        <a href="#expertise" class="text-gray-300 hover:text-blue-400 transition-colors">Expertise</a>
        <a href="#clients" class="text-gray-300 hover:text-blue-400 transition-colors">Clients</a>
        <a href="#contact" class="text-gray-300 hover:text-blue-400 transition-colors">Contact</a>
      </div>
    </nav>

    <!-- Hero Section -->
    <div class="flex items-center justify-center min-h-screen p-8">
      <div class="glassmorphism p-16 max-w-7xl w-full text-center">
        <h1 class="text-8xl font-black mb-8 gradient-text-devops">
          EPrecisio
        </h1>
        <p class="text-3xl text-gray-200 mb-6 font-light">
          DevOps Consulting & Infrastructure Excellence
        </p>
        <p class="text-xl text-gray-300 mb-12 max-w-4xl mx-auto leading-relaxed">
          Transform your infrastructure with enterprise-grade DevOps solutions. 
          From Kubernetes orchestration to multi-cloud migrations, we deliver scalable, 
          secure, and cost-optimized infrastructure that powers your business growth.
        </p>

        <!-- Services Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <div class="glassmorphism p-6">
            <div class="text-5xl mb-4">☸️</div>
            <h3 class="text-lg font-bold text-white mb-3">Kubernetes</h3>
            <p class="text-gray-300 text-sm">Container orchestration, scaling, and management</p>
          </div>
          <div class="glassmorphism p-6">
            <div class="text-5xl mb-4">☁️</div>
            <h3 class="text-lg font-bold text-white mb-3">Cloud Migration</h3>
            <p class="text-gray-300 text-sm">AWS, OCI, multi-cloud architecture</p>
          </div>
          <div class="glassmorphism p-6">
            <div class="text-5xl mb-4">🔒</div>
            <h3 class="text-lg font-bold text-white mb-3">Security</h3>
            <p class="text-gray-300 text-sm">Infrastructure security and compliance</p>
          </div>
          <div class="glassmorphism p-6">
            <div class="text-5xl mb-4">📊</div>
            <h3 class="text-lg font-bold text-white mb-3">Monitoring</h3>
            <p class="text-gray-300 text-sm">Performance monitoring and optimization</p>
          </div>
        </div>

        <!-- Client Showcase -->
        <div class="glassmorphism p-8 mb-16">
          <h2 class="text-4xl font-bold text-white mb-6">Trusted by Leading Organizations</h2>
          <p class="text-gray-300 mb-8">
            We've successfully delivered infrastructure transformations for enterprises worldwide, 
            managing 300+ Kubernetes nodes and migrating 40+ applications across multi-cloud environments.
          </p>
          <div class="flex justify-center space-x-12 text-2xl font-bold text-gray-400">
            <span>Unifonic</span>
            <span>•</span>
            <span>Enterprise Clients</span>
            <span>•</span>
            <span>Global Partners</span>
          </div>
        </div>

        <!-- CTA Section -->
        <div class="glassmorphism p-8">
          <h2 class="text-3xl font-bold text-white mb-4">Ready to Transform Your Infrastructure?</h2>
          <p class="text-gray-300 mb-6">Let's discuss how we can optimize your DevOps processes and scale your systems.</p>
          <div class="flex justify-center space-x-6">
            <button class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors">
              Get Consultation
            </button>
            <button class="border border-gray-400 hover:border-gray-300 text-gray-300 hover:text-white font-semibold py-3 px-8 rounded-lg transition-colors">
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

function serveStaticFile(filePath, res, siteName) {
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(createNotFoundPage(siteName));
      return;
    }

    let html = content;
    const devIndicator = '<div style="position: fixed; top: 10px; right: 10px; background: linear-gradient(45deg, #22c55e, #3b82f6); color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.3); backdrop-filter: blur(8px);">🎨 GLASSMORPHISM</div>';
    
    html = html.replace('</head>', `  ${hotReloadScript}\n</head>`);
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
<html>
<head>
  <title>Not Found - ${siteName}</title>
  <style>
    body { 
      margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', sans-serif;
    }
    .glassmorphism {
      background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 20px;
      box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37); padding: 2rem; text-align: center;
    }
    .dev-indicator { 
      position: fixed; top: 10px; right: 10px; 
      background: linear-gradient(45deg, #ef4444, #f59e0b); color: white; 
      padding: 8px 12px; border-radius: 8px; font-size: 12px; z-index: 9999;
    }
  </style>
  ${hotReloadScript}
</head>
<body>
  <div class="dev-indicator">🎨 GLASSMORPHISM 404</div>
  <div class="glassmorphism">
    <h1 style="color: white; font-size: 2.5rem; margin-bottom: 1rem;">404 - Not Found</h1>
    <p style="color: rgba(255,255,255,0.8); font-size: 1.2rem;">${siteName}</p>
  </div>
</body>
</html>`;
}

function createServer(port, siteName, worktreePath) {
  const distPath = path.join(worktreePath, 'dist');
  const srcPagesPath = path.join(worktreePath, 'src', 'pages');

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
    
    // Priority 1: Built static files (urnlabs.ai has this)
    const staticFilePath = path.join(distPath, requestedPath);
    if (fs.existsSync(staticFilePath) && staticFilePath.endsWith('.html')) {
      console.log(`🎨 Serving built glassmorphism: ${staticFilePath}`);
      serveStaticFile(staticFilePath, res, siteName);
      return;
    }
    
    // Priority 2: Enhanced glassmorphism designs for specific sites
    if (requestedPath === '/index.html' || requestedPath === '/') {
      console.log(`🎨 Serving enhanced glassmorphism design for: ${siteName}`);
      let html;
      if (siteName === 'usmanramzan.ai') {
        html = createUsmanRamzanDesign();
      } else if (siteName === 'eprecisio.com') {
        html = createEPrecisioDesign();
      } else {
        // urnlabs.ai should use built files
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          serveStaticFile(indexPath, res, siteName);
          return;
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
    
    // 404
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(createNotFoundPage(siteName));
  });

  server.listen(port, () => {
    console.log(`🎨 ${siteName}: http://localhost:${port} (complete glassmorphism)`);
  });
  
  return server;
}

// Site configurations
const sites = [
  { port: 8001, name: 'usmanramzan.ai', path: './worktrees/usmanramzan-ai' },
  { port: 8002, name: 'urnlabs.ai', path: './worktrees/urnlabs-ai' },
  { port: 8003, name: 'eprecisio.com', path: './worktrees/eprecisio-com' }
];

console.log('🎨 Starting Complete Glassmorphism Development Servers...\n');

const runningServers = [];
sites.forEach(({ port, name, path: sitePath }) => {
  const server = createServer(port, name, sitePath);
  runningServers.push(server);
});

console.log('\n✨ All complete glassmorphism servers started!');
console.log('🎯 usmanramzan.ai: Neural network animations with glassmorphism');
console.log('🎯 urnlabs.ai: Professional built design with gradients');  
console.log('🎯 eprecisio.com: DevOps infrastructure glassmorphism');
console.log('🔥 Hot reload enabled with proper glassmorphism styling');

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down complete glassmorphism servers...');
  runningServers.forEach(server => server.close());
  process.exit(0);
});