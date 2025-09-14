const http = require('http');
const fs = require('fs');
const path = require('path');

function convertAstroToHtml(content, projectRoot) {
  // Enhanced Astro to HTML conversion with better JSX handling
  let html = content;
  
  // Handle imports (remove them for now)
  html = html.replace(/import\s+.*?from\s+['"].*?['"];?\n?/g, '');
  
  // Handle frontmatter (remove --- blocks)
  html = html.replace(/^---[\s\S]*?---\n?/m, '');
  
  // Remove JSX comments {/* */} (this was the main issue!)
  html = html.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  
  // Convert basic Astro/JSX components to HTML approximations
  html = html.replace(/<Layout[^>]*>/g, '<div class="layout-wrapper">');
  html = html.replace(/<\/Layout>/g, '</div>');
  
  // Convert main tag with classes
  html = html.replace(/<main[^>]*>/g, '<main class="min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">');
  
  // Convert sections
  html = html.replace(/<section[^>]*>/g, '<section class="py-20 px-4">');
  
  // Replace React components with placeholder content
  const componentReplacements = {
    '<Navigation client:load />': '<nav class="fixed top-0 w-full bg-black/20 backdrop-blur z-50 p-4"><div class="container mx-auto"><h2 class="text-xl font-bold text-white">EPrecisio Navigation</h2></div></nav>',
    '<DevOpsHero client:load />': '<div class="hero-section text-center py-32"><h1 class="text-6xl font-bold text-white mb-6">EPrecisio</h1><p class="text-xl text-gray-300">DevOps Consulting & Infrastructure Excellence</p></div>',
    '<ClientShowcase client:load />': '<div class="client-showcase text-center py-20"><h2 class="text-4xl font-bold text-white mb-8">Our Clients</h2><p class="text-gray-300">Trusted by leading organizations worldwide</p></div>',
    '<InfrastructureVisualization client:load />': '<div class="infrastructure-viz text-center py-20"><h2 class="text-4xl font-bold text-white mb-8">Infrastructure Solutions</h2><p class="text-gray-300">Scalable, reliable, and secure infrastructure</p></div>',
    '<ServicesShowcase client:load />': '<div class="services text-center py-20"><h2 class="text-4xl font-bold text-white mb-8">Our Services</h2><p class="text-gray-300">Comprehensive DevOps and Cloud Solutions</p></div>',
    '<ExpertiseMatrix client:load />': '<div class="expertise text-center py-20"><h2 class="text-4xl font-bold text-white mb-8">Our Expertise</h2><p class="text-gray-300">Deep knowledge across multiple technologies</p></div>',
    '<ConsultingProcess client:load />': '<div class="process text-center py-20"><h2 class="text-4xl font-bold text-white mb-8">Consulting Process</h2><p class="text-gray-300">Proven methodology for successful implementations</p></div>',
    '<CaseStudies client:load />': '<div class="case-studies text-center py-20"><h2 class="text-4xl font-bold text-white mb-8">Case Studies</h2><p class="text-gray-300">Real-world success stories</p></div>',
    '<CompanyEcosystem client:load />': '<div class="ecosystem text-center py-20"><h2 class="text-4xl font-bold text-white mb-8">Company Ecosystem</h2><p class="text-gray-300">Integrated solutions and partnerships</p></div>',
    '<ContactSection client:load />': '<div class="contact text-center py-20"><h2 class="text-4xl font-bold text-white mb-8">Contact Us</h2><p class="text-gray-300">Ready to transform your infrastructure?</p></div>'
  };
  
  for (const [component, replacement] of Object.entries(componentReplacements)) {
    html = html.replace(new RegExp(component.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
  }
  
  // Add meta refresh for hot reload
  const autoRefreshScript = `
    <script>
      // Check for file changes every 2 seconds
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
      
      console.log('🔥 Hot reload active - files will auto-refresh when changed');
    </script>
  `;
  
  // Wrap in basic HTML structure if not already present
  if (!html.includes('<html>')) {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EPrecisio - Development Server</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; background: #0f172a; color: #e2e8f0; }
    .dev-indicator { 
      position: fixed; 
      top: 10px; 
      right: 10px; 
      background: #22c55e; 
      color: white; 
      padding: 5px 10px; 
      border-radius: 5px; 
      font-size: 12px;
      z-index: 9999;
    }
    .hero-section { 
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .container { max-width: 1200px; margin: 0 auto; }
  </style>
  ${autoRefreshScript}
</head>
<body>
  <div class="dev-indicator">🔥 DEV MODE</div>
  ${html}
</body>
</html>`;
  } else {
    // Insert auto refresh script before closing head tag
    html = html.replace('</head>', `  ${autoRefreshScript}\n</head>`);
    // Add dev indicator
    html = html.replace('<body>', '<body>\n  <div class="dev-indicator">🔥 DEV MODE</div>');
  }
  
  return html;
}

function createServer(port, rootDir, siteName) {
  const server = http.createServer((req, res) => {
    let requestedPath = req.url === '/' ? '/index.astro' : req.url;
    
    // Handle static assets
    if (req.url.startsWith('/public/')) {
      const assetPath = path.join(rootDir, '..', req.url);
      if (fs.existsSync(assetPath)) {
        const ext = path.extname(assetPath);
        const mimeTypes = {
          '.css': 'text/css',
          '.js': 'text/javascript',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml'
        };
        const stats = fs.statSync(assetPath);
        res.writeHead(200, { 
          'Content-Type': mimeTypes[ext] || 'text/plain',
          'Last-Modified': stats.mtime.toUTCString()
        });
        fs.createReadStream(assetPath).pipe(res);
        return;
      }
    }
    
    // If no extension, try .astro first
    if (!path.extname(requestedPath)) {
      requestedPath += '.astro';
    }
    
    let filePath = path.join(rootDir, requestedPath);
    
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        // Try index.astro as fallback
        fs.readFile(path.join(rootDir, 'index.astro'), 'utf8', (err2, indexData) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>File not found - ${siteName}</title>
                  <style>
                    body { font-family: Arial, sans-serif; padding: 40px; background: #1a1a1a; color: #fff; }
                    .error { background: #2a2a2a; padding: 20px; border-radius: 8px; }
                    .dev-indicator { 
                      position: fixed; 
                      top: 10px; 
                      right: 10px; 
                      background: #ef4444; 
                      color: white; 
                      padding: 5px 10px; 
                      border-radius: 5px; 
                      font-size: 12px;
                    }
                  </style>
                </head>
                <body>
                  <div class="dev-indicator">🔥 DEV MODE</div>
                  <div class="error">
                    <h1>🚀 ${siteName} - Development Server</h1>
                    <p><strong>File not found:</strong> ${req.url}</p>
                    <p><strong>Looking for:</strong> ${filePath}</p>
                    <p><strong>Available files:</strong></p>
                    <ul>
                      <li><a href="/" style="color: #60a5fa;">/ (index)</a></li>
                    </ul>
                  </div>
                </body>
              </html>
            `);
          } else {
            const stats = fs.statSync(path.join(rootDir, 'index.astro'));
            const htmlContent = convertAstroToHtml(indexData, path.dirname(filePath));
            res.writeHead(200, { 
              'Content-Type': 'text/html',
              'Last-Modified': stats.mtime.toUTCString()
            });
            res.end(htmlContent);
          }
        });
      } else {
        try {
          const stats = fs.statSync(filePath);
          const htmlContent = convertAstroToHtml(data, path.dirname(filePath));
          res.writeHead(200, { 
            'Content-Type': 'text/html',
            'Last-Modified': stats.mtime.toUTCString()
          });
          res.end(htmlContent);
        } catch (statErr) {
          const htmlContent = convertAstroToHtml(data, path.dirname(filePath));
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(htmlContent);
        }
      }
    });
  });

  server.listen(port, () => {
    console.log(`🚀 ${siteName}: http://localhost:${port} (hot reload enabled)`);
  });
  
  return server;
}

// Start all three servers
const servers = [
  { port: 8001, dir: './worktrees/usmanramzan-ai/src/pages', name: 'usmanramzan.ai' },
  { port: 8002, dir: './worktrees/urnlabs-ai/src/pages', name: 'urnlabs.ai' },
  { port: 8003, dir: './worktrees/eprecisio-com/src/pages', name: 'eprecisio.com' }
];

console.log('🔥 Starting development servers with hot reload...\n');

const runningServers = [];
servers.forEach(({ port, dir, name }) => {
  const server = createServer(port, dir, name);
  runningServers.push(server);
});

console.log('\n✨ All development servers started!');
console.log('🔄 Changes to .astro files will be reflected when you refresh the page');
console.log('💡 Each page checks for changes automatically every second');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down servers...');
  runningServers.forEach(server => server.close());
  process.exit(0);
});