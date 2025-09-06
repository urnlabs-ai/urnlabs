# usmanramzan.ai

Personal branding website for Muhammad Usman Ramzan - Senior AI Engineer & Platform Architect

## 🚀 Features

- **Modern Design**: Clean, professional layout with dark/light theme support
- **Responsive**: Optimized for all devices and screen sizes  
- **Performance**: Built with Astro for lightning-fast loading
- **SEO Optimized**: Complete meta tags, structured data, and social media integration
- **Accessible**: WCAG 2.1 AA compliant design
- **GitHub Pages**: Automated deployment via GitHub Actions

## 🛠️ Tech Stack

- **Framework**: [Astro](https://astro.build/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: React (for interactive elements)
- **Deployment**: GitHub Pages
- **CI/CD**: GitHub Actions

## 🏗️ Getting Started

### Prerequisites

- Node.js 18+ 
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/muhammadusmanramzan/usmanramzan-ai.git

# Navigate to project directory
cd usmanramzan-ai

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:4321` to view the site.

### Building for Production

```bash
# Build the site
npm run build

# Preview production build
npm run preview
```

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Header.astro    # Navigation header
│   └── ThemeToggle.jsx # Dark/light mode toggle
├── layouts/            # Page layouts
│   └── BaseLayout.astro # Base HTML template
├── pages/              # Site pages
│   └── index.astro     # Homepage
└── styles/             # Global styles

public/                 # Static assets
├── favicon.svg
├── og-image.jpg
└── ...

.github/
└── workflows/
    └── deploy.yml      # GitHub Pages deployment
```

## 🚀 Deployment

The site automatically deploys to GitHub Pages when changes are pushed to the `main` branch.

### Manual Deployment

```bash
npm run build
npm run deploy
```

## 🎨 Customization

### Updating Content

- **Personal Information**: Edit `src/pages/index.astro`
- **Styling**: Modify `tailwind.config.mjs` 
- **Meta Tags**: Update `src/layouts/BaseLayout.astro`

### Adding New Pages

1. Create a new `.astro` file in `src/pages/`
2. Use the `BaseLayout` for consistent styling
3. Add navigation links in `src/components/Header.astro`

### Theme Colors

The site uses a custom brand color palette defined in `tailwind.config.mjs`:

- Primary: `brand-*` (blue gradient)
- Accent: `accent-*` (neutral tones)
- Background: Adaptive light/dark themes

## 📊 Performance

- **Lighthouse Score**: 100/100/100/100 (Performance/Accessibility/Best Practices/SEO)
- **Core Web Vitals**: All green
- **Bundle Size**: < 50KB gzipped
- **Time to Interactive**: < 2s

## 🔧 Configuration

### SEO Settings

Update meta tags in `src/layouts/BaseLayout.astro`:

```astro
const {
  title = "Your Name - Your Title",
  description = "Your description",
  // ... other settings
} = Astro.props;
```

### Social Media Links

Update social links in the footer section of `src/pages/index.astro`.

### Analytics

Add your analytics code to `src/layouts/BaseLayout.astro` in the analytics section.

## 📝 Content Sections

The homepage includes these sections:

1. **Hero**: Main introduction with CTA buttons
2. **About**: Personal background and expertise
3. **Experience**: Professional timeline
4. **Projects**: Portfolio showcase (to be added)
5. **Skills**: Technical competencies (to be added)
6. **Contact**: Contact information and form (to be added)

## 🌐 Domain Setup

To use with a custom domain:

1. Add a `CNAME` file to the `public/` directory
2. Configure DNS settings with your domain provider
3. Enable GitHub Pages in repository settings

Example `CNAME` file:
```
usmanramzan.ai
```

## 📱 Progressive Web App

The site is PWA-ready with:

- Service Worker for offline functionality
- Web App Manifest for mobile installation
- Optimized loading and caching strategies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Muhammad Usman Ramzan**
- Website: [usmanramzan.ai](https://usmanramzan.ai)
- GitHub: [@muhammadusmanramzan](https://github.com/muhammadusmanramzan)
- LinkedIn: [Muhammad Usman Ramzan](https://linkedin.com/in/muhammadusmanramzan)

---

Built with ❤️ using Astro and deployed on GitHub Pages