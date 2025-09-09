const http = require('http');
const fs = require('fs');
const path = require('path');

function createServer(port, rootDir) {
  const server = http.createServer((req, res) => {
    let requestedPath = req.url === '/' ? '/index.astro' : req.url;
    
    // If no extension, try .astro first, then .html
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
                    <h1>🚀 Development Server</h1>
                    <p><strong>File not found:</strong> ${req.url}</p>
                    <p><strong>Looking for:</strong> ${filePath}</p>
                    <p><strong>Available files:</strong></p>
                    <ul>
                      <li><a href="/">/ (index)</a></li>
                    </ul>
                  </div>
                </body>
              </html>
            `);
          } else {
            // Serve the Astro file as HTML (basic conversion)
            const htmlContent = convertAstroToHtml(indexData, path.dirname(path.join(rootDir, 'index.astro')));
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlContent);
          }
        });
      } else {
        // Serve the Astro file as HTML (basic conversion)
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

function convertAstroToHtml(astroContent, baseDir) {
  // Basic Astro to HTML conversion
  let html = astroContent;
  
  // Remove frontmatter (everything between --- ---)
  html = html.replace(/^---[\s\S]*?---\n?/m, '');
  
  // Convert <Layout> components to basic HTML structure
  if (html.includes('<Layout')) {
    html = html.replace(/<Layout[^>]*title="([^"]*)"[^>]*>/, `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>$1</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <script src="https://unpkg.com/framer-motion@10/dist/framer-motion.js"></script>
          <style>
            body { margin: 0; background: #0f172a; color: #e2e8f0; }
            .glassmorphism { backdrop-filter: blur(20px); background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); }
          </style>
        </head>
        <body>
    `);
    html = html.replace(/<\/Layout>/, '</body></html>');
  }
  
  // Remove client:load directives
  html = html.replace(/client:load/g, '');
  
  // Basic component placeholders
  html = html.replace(/<CompanyHero[^>]*\/?>/, '<div class="min-h-screen flex items-center justify-center"><h1 class="text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">UrnLabs AI Platform</h1></div>');
  html = html.replace(/<DevOpsHero[^>]*\/?>/, '<div class="min-h-screen flex items-center justify-center"><h1 class="text-6xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">EPrecisio DevOps</h1></div>');
  html = html.replace(/<AINetworkHero[^>]*\/?>/, '<div class="min-h-screen flex items-center justify-center"><h1 class="text-6xl font-bold bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">Usman Ramzan AI</h1></div>');
  
  // Add basic navigation
  if (!html.includes('<!DOCTYPE html')) {
    html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Development Server</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { margin: 0; background: #0f172a; color: #e2e8f0; }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `;
  }
  
  return html;
}

// Create servers for each site
createServer(8001, './worktrees/usmanramzan-ai/src/pages');
createServer(8002, './worktrees/urnlabs-ai/src/pages');  
createServer(8003, './worktrees/eprecisio-com/src/pages');

console.log('All development servers started!');
console.log('usmanramzan.ai: http://localhost:8001');
console.log('urnlabs.ai: http://localhost:8002');
console.log('eprecisio.com: http://localhost:8003');