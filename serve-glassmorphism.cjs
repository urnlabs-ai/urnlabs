const http = require('http');
const fs = require('fs');
const path = require('path');

// Hot reload script to inject into HTML
const hotReloadScript = `
<script>
  // Hot reload functionality
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
  
  console.log('🔥 Glassmorphism hot reload active');
</script>
`;

function serveStaticFile(filePath, res, siteName) {
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>File not found - ${siteName}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; background: #0f172a; color: #fff; }
              .error { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 20px; border-radius: 12px; }
              .dev-indicator { 
                position: fixed; top: 10px; right: 10px; background: #22c55e; color: white; 
                padding: 5px 10px; border-radius: 5px; font-size: 12px; z-index: 9999;
              }
            </style>
            ${hotReloadScript}
          </head>
          <body>
            <div class="dev-indicator">🔥 GLASSMORPHISM DEV</div>
            <div class="error">
              <h1>🎨 ${siteName} - Glassmorphism Development Server</h1>
              <p><strong>File not found:</strong> ${filePath}</p>
              <p>Looking for built static files with glassmorphism designs...</p>
            </div>
          </body>
        </html>
      `);
      return;
    }

    // Inject hot reload script and dev indicator into HTML
    let html = content;
    
    // Add dev indicator for glassmorphism mode
    const devIndicator = '<div style="position: fixed; top: 10px; right: 10px; background: linear-gradient(45deg, #22c55e, #3b82f6); color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.3); backdrop-filter: blur(8px);">🎨 GLASSMORPHISM DEV</div>';
    
    // Inject hot reload script before closing head tag
    html = html.replace('</head>', `  ${hotReloadScript}\n</head>`);
    
    // Add dev indicator after opening body tag
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

function convertAstroToHtmlFallback(content) {
  // Fallback Astro to HTML conversion (simplified for when static files don't exist)
  let html = content;
  
  // Remove imports and frontmatter
  html = html.replace(/import\s+.*?from\s+['"].*?['"];?\n?/g, '');
  html = html.replace(/^---[\s\S]*?---\n?/m, '');
  html = html.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  
  // Basic glassmorphism styling for fallback
  const fallbackGlassmorphismHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Glassmorphism Development Server</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { 
      margin: 0; 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      font-family: 'Inter', sans-serif;
    }
    .glassmorphism {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
    }
    .dev-indicator { 
      position: fixed; top: 10px; right: 10px; 
      background: linear-gradient(45deg, #22c55e, #3b82f6); color: white; 
      padding: 8px 12px; border-radius: 8px; font-size: 12px; z-index: 9999;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3); backdrop-filter: blur(8px);
    }
    .hero-glass {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(30px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
  </style>
  ${hotReloadScript}
</head>
<body>
  <div class="dev-indicator">🎨 GLASSMORPHISM DEV</div>
  <div class="min-h-screen flex items-center justify-center p-8">
    <div class="glassmorphism p-12 max-w-4xl text-center">
      <h1 class="text-6xl font-bold text-white mb-6">
        Glassmorphism Design
      </h1>
      <p class="text-xl text-gray-100 mb-8">
        Development server with glassmorphism effects
      </p>
      <div class="hero-glass p-8 rounded-lg">
        ${html}
      </div>
    </div>
  </div>
</body>
</html>`;
  
  return fallbackGlassmorphismHTML;
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
          '.css': 'text/css',
          '.js': 'text/javascript', 
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.woff2': 'font/woff2',
          '.woff': 'font/woff'
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
    
    // Priority 1: Serve built static HTML files (these have glassmorphism!)
    const staticFilePath = path.join(distPath, requestedPath);
    if (fs.existsSync(staticFilePath) && staticFilePath.endsWith('.html')) {
      console.log(`🎨 Serving glassmorphism static file: ${staticFilePath}`);
      serveStaticFile(staticFilePath, res, siteName);
      return;
    }
    
    // Priority 2: Try to serve index.html from dist (main glassmorphism design)
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      console.log(`🎨 Serving glassmorphism index: ${indexPath}`);
      serveStaticFile(indexPath, res, siteName);
      return;
    }
    
    // Priority 3: Fallback to Astro source with glassmorphism wrapper
    let astroPath = requestedPath.replace('.html', '.astro');
    if (astroPath === '/') astroPath = '/index.astro';
    const sourceFilePath = path.join(srcPagesPath, astroPath);
    
    if (fs.existsSync(sourceFilePath)) {
      console.log(`📝 Converting Astro to glassmorphism HTML: ${sourceFilePath}`);
      fs.readFile(sourceFilePath, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('Error reading file');
          return;
        }
        
        const html = convertAstroToHtmlFallback(data);
        const stats = fs.statSync(sourceFilePath);
        res.writeHead(200, { 
          'Content-Type': 'text/html',
          'Last-Modified': stats.mtime.toUTCString()
        });
        res.end(html);
      });
      return;
    }
    
    // 404 with glassmorphism styling
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
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
              box-shadow: 0 4px 6px rgba(0,0,0,0.3); backdrop-filter: blur(8px);
            }
          </style>
          ${hotReloadScript}
        </head>
        <body>
          <div class="dev-indicator">🎨 GLASSMORPHISM DEV</div>
          <div class="glassmorphism">
            <h1 style="color: white; font-size: 2.5rem; margin-bottom: 1rem;">404 - Not Found</h1>
            <p style="color: rgba(255,255,255,0.8); font-size: 1.2rem;">${siteName}</p>
            <p style="color: rgba(255,255,255,0.6);">Looking for: ${req.url}</p>
          </div>
        </body>
      </html>
    `);
  });

  server.listen(port, () => {
    console.log(`🎨 ${siteName}: http://localhost:${port} (glassmorphism + hot reload)`);
  });
  
  return server;
}

// Site configurations
const sites = [
  { 
    port: 8001, 
    name: 'usmanramzan.ai', 
    path: './worktrees/usmanramzan-ai'
  },
  { 
    port: 8002, 
    name: 'urnlabs.ai', 
    path: './worktrees/urnlabs-ai'
  },
  { 
    port: 8003, 
    name: 'eprecisio.com', 
    path: './worktrees/eprecisio-com'
  }
];

console.log('🎨 Starting Glassmorphism Development Servers...\n');

const runningServers = [];
sites.forEach(({ port, name, path: sitePath }) => {
  const server = createServer(port, name, sitePath);
  runningServers.push(server);
});

console.log('\n✨ All glassmorphism servers started!');
console.log('🔄 Serving built static files with glassmorphism designs when available');
console.log('📝 Fallback to enhanced Astro conversion with glassmorphism styling');
console.log('🔥 Hot reload enabled for all files');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down glassmorphism servers...');
  runningServers.forEach(server => server.close());
  process.exit(0);
});