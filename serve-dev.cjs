const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// Hot reload WebSocket server
const wss = new WebSocketServer({ port: 3001 });

console.log('WebSocket server for hot reload running on ws://localhost:3001');

// File watcher for hot reload
function watchFiles(rootDir) {
  fs.watch(rootDir, { recursive: true }, (eventType, filename) => {
    if (filename && (filename.endsWith('.astro') || filename.endsWith('.tsx') || filename.endsWith('.ts') || filename.endsWith('.js'))) {
      console.log(`File changed: ${filename}`);
      // Broadcast reload message to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify({ type: 'reload' }));
        }
      });
    }
  });
}

function convertAstroToHtml(content, projectRoot) {
  // Enhanced Astro to HTML conversion
  let html = content;
  
  // Handle imports (remove them for now, but could be enhanced)
  html = html.replace(/import\s+.*?from\s+['"].*?['"];?\n?/g, '');
  
  // Handle frontmatter (remove --- blocks)
  html = html.replace(/^---[\s\S]*?---\n?/m, '');
  
  // Handle Astro components (basic conversion)
  html = html.replace(/<(\w+)\s*\/?>.*?<\/\1>/gs, (match, tag) => {
    // For now, just return the content inside the tag
    return match;
  });
  
  // Add hot reload script
  const hotReloadScript = `
    <script>
      (function() {
        const ws = new WebSocket('ws://localhost:3001');
        ws.onmessage = function(event) {
          const data = JSON.parse(event.data);
          if (data.type === 'reload') {
            window.location.reload();
          }
        };
        ws.onopen = function() {
          console.log('Hot reload connected');
        };
        ws.onclose = function() {
          console.log('Hot reload disconnected');
          // Try to reconnect after 1 second
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        };
      })();
    </script>
  `;
  
  // Wrap in basic HTML structure if not already present
  if (!html.includes('<html>')) {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Development Server</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; background: #0f172a; color: #e2e8f0; }
  </style>
  ${hotReloadScript}
</head>
<body>
  ${html}
</body>
</html>`;
  } else {
    // Insert hot reload script before closing head tag
    html = html.replace('</head>', `  ${hotReloadScript}\n</head>`);
  }
  
  return html;
}

function createServer(port, rootDir) {
  // Start watching files for changes
  watchFiles(rootDir);
  
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
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
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
                  <title>File not found</title>
                  <style>
                    body { font-family: Arial, sans-serif; padding: 40px; background: #1a1a1a; color: #fff; }
                    .error { background: #2a2a2a; padding: 20px; border-radius: 8px; }
                  </style>
                </head>
                <body>
                  <div class="error">
                    <h1>🚀 Development Server with Hot Reload</h1>
                    <p><strong>File not found:</strong> ${req.url}</p>
                    <p><strong>Looking for:</strong> ${filePath}</p>
                  </div>
                </body>
              </html>
            `);
          } else {
            const htmlContent = convertAstroToHtml(indexData, path.dirname(filePath));
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlContent);
          }
        });
      } else {
        const htmlContent = convertAstroToHtml(data, path.dirname(filePath));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlContent);
      }
    });
  });

  server.listen(port, () => {
    console.log(`Server running on port ${port} serving ${rootDir}`);
  });
}

// Start all three servers
const servers = [
  { port: 8001, dir: './worktrees/usmanramzan-ai/src/pages', name: 'usmanramzan.ai' },
  { port: 8002, dir: './worktrees/urnlabs-ai/src/pages', name: 'urnlabs.ai' },
  { port: 8003, dir: './worktrees/eprecisio-com/src/pages', name: 'eprecisio.com' }
];

console.log('🚀 Starting development servers with hot reload...\n');

servers.forEach(({ port, dir, name }) => {
  createServer(port, dir);
  console.log(`${name}: http://localhost:${port}`);
});

console.log('\n✨ All development servers started with hot reload!');
console.log('💡 WebSocket hot reload server: ws://localhost:3001');