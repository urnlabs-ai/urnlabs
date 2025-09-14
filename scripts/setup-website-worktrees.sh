#!/bin/bash

# 🚀 Website Platform Worktrees Setup Script
# Ultra-comprehensive 3-website development with specialized agent coordination

set -e

echo "🎯 Setting up Website Platform Worktrees Infrastructure..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Create worktrees directory
echo -e "${BLUE}📁 Creating worktrees directory structure...${NC}"
mkdir -p worktrees

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

# Create branches for each worktree if they don't exist
echo -e "${PURPLE}🌿 Creating specialized branches...${NC}"

BRANCHES=(
    "usmanramzan-ai"
    "urnlabs-ai"
    "eprecisio-com"
    "shared-components"
    "infrastructure"
    "design-system"
)

for branch in "${BRANCHES[@]}"; do
    if git branch --list | grep -q "$branch"; then
        echo -e "${YELLOW}⚠️  Branch $branch already exists${NC}"
    else
        echo -e "${GREEN}✨ Creating branch: $branch${NC}"
        git branch "$branch"
    fi
done

# Create worktrees
echo -e "${CYAN}🔧 Setting up worktrees for specialized agents...${NC}"

# @frontend-agent + @design-agent - usmanramzan.ai
if [ ! -d "worktrees/usmanramzan-ai" ]; then
    echo -e "${GREEN}🎨 Setting up usmanramzan-ai worktree (@frontend-agent + @design-agent)${NC}"
    git worktree add worktrees/usmanramzan-ai usmanramzan-ai
    
    # Copy existing content if available
    if [ -d "apps/usmanramzan-ai" ]; then
        echo -e "${BLUE}📋 Migrating existing usmanramzan-ai content...${NC}"
        cp -r apps/usmanramzan-ai/* worktrees/usmanramzan-ai/ 2>/dev/null || true
    fi
else
    echo -e "${YELLOW}⚠️  usmanramzan-ai worktree already exists${NC}"
fi

# @frontend-agent + @content-agent - urnlabs.ai
if [ ! -d "worktrees/urnlabs-ai" ]; then
    echo -e "${GREEN}🏢 Setting up urnlabs-ai worktree (@frontend-agent + @content-agent)${NC}"
    git worktree add worktrees/urnlabs-ai urnlabs-ai
    
    # Copy existing content if available
    if [ -d "apps/urnlabs" ]; then
        echo -e "${BLUE}📋 Migrating existing urnlabs content...${NC}"
        cp -r apps/urnlabs/* worktrees/urnlabs-ai/ 2>/dev/null || true
    fi
else
    echo -e "${YELLOW}⚠️  urnlabs-ai worktree already exists${NC}"
fi

# @frontend-agent + @marketing-agent - eprecisio.com (new)
if [ ! -d "worktrees/eprecisio-com" ]; then
    echo -e "${GREEN}🛠️  Setting up eprecisio-com worktree (@frontend-agent + @marketing-agent)${NC}"
    git worktree add worktrees/eprecisio-com eprecisio-com
    
    # Create initial structure for eprecisio.com
    mkdir -p worktrees/eprecisio-com/src
    echo "# Eprecisio.com - DevOps Consulting Website Revamp" > worktrees/eprecisio-com/README.md
else
    echo -e "${YELLOW}⚠️  eprecisio-com worktree already exists${NC}"
fi

# @component-agent - Shared components
if [ ! -d "worktrees/shared-components" ]; then
    echo -e "${GREEN}🧩 Setting up shared-components worktree (@component-agent)${NC}"
    git worktree add worktrees/shared-components shared-components
    
    mkdir -p worktrees/shared-components/{ui-components,animations,design-tokens,utilities}
    echo "# Shared Component Library - Glassmorphism & 2025 UI Components" > worktrees/shared-components/README.md
else
    echo -e "${YELLOW}⚠️  shared-components worktree already exists${NC}"
fi

# @infrastructure-agent - AWS deployment
if [ ! -d "worktrees/infrastructure" ]; then
    echo -e "${GREEN}☁️  Setting up infrastructure worktree (@infrastructure-agent)${NC}"
    git worktree add worktrees/infrastructure infrastructure
    
    mkdir -p worktrees/infrastructure/{aws-cdk,github-actions,monitoring,scripts}
    echo "# AWS Infrastructure - S3/CloudFront/Route53 for 3-Website Platform" > worktrees/infrastructure/README.md
else
    echo -e "${YELLOW}⚠️  infrastructure worktree already exists${NC}"
fi

# @design-agent - Design system
if [ ! -d "worktrees/design-system" ]; then
    echo -e "${GREEN}🎨 Setting up design-system worktree (@design-agent)${NC}"
    git worktree add worktrees/design-system design-system
    
    mkdir -p worktrees/design-system/{tokens,components,animations,guidelines}
    echo "# Design System - 2025 Glassmorphism, Micro-interactions, Design Tokens" > worktrees/design-system/README.md
else
    echo -e "${YELLOW}⚠️  design-system worktree already exists${NC}"
fi

# Create coordination scripts
echo -e "${CYAN}📜 Creating coordination management scripts...${NC}"

# Status check script
cat > scripts/status-all-websites.sh << 'EOF'
#!/bin/bash
# Check status across all website worktrees

echo "🌐 Website Platform Status Check"
echo "================================"

WORKTREES=("usmanramzan-ai" "urnlabs-ai" "eprecisio-com" "shared-components" "infrastructure" "design-system")

for worktree in "${WORKTREES[@]}"; do
    if [ -d "worktrees/$worktree" ]; then
        echo -e "\n📍 worktrees/$worktree:"
        cd "worktrees/$worktree"
        
        echo "   Branch: $(git branch --show-current)"
        echo "   Status: $(git status --porcelain | wc -l) modified files"
        echo "   Last commit: $(git log -1 --pretty=format:'%h %s' 2>/dev/null || echo 'No commits')"
        
        cd ../..
    else
        echo -e "\n❌ worktrees/$worktree: NOT FOUND"
    fi
done

echo -e "\n✅ Status check complete"
EOF

chmod +x scripts/status-all-websites.sh

# Sync script
cat > scripts/sync-all-websites.sh << 'EOF'
#!/bin/bash
# Sync all website worktrees with remote

echo "🔄 Syncing All Website Worktrees"
echo "================================"

WORKTREES=("usmanramzan-ai" "urnlabs-ai" "eprecisio-com" "shared-components" "infrastructure" "design-system")

for worktree in "${WORKTREES[@]}"; do
    if [ -d "worktrees/$worktree" ]; then
        echo -e "\n🔄 Syncing worktrees/$worktree..."
        cd "worktrees/$worktree"
        
        git fetch origin
        git pull origin "$(git branch --show-current)" || echo "⚠️  No remote branch yet"
        
        cd ../..
    fi
done

echo -e "\n✅ All worktrees synced"
EOF

chmod +x scripts/sync-all-websites.sh

# Create agent assignments documentation
cat > WEBSITE-AGENT-ASSIGNMENTS.md << 'EOF'
# 🤖 Website Platform Agent Assignments

## Specialized Agent Responsibilities

### @design-agent (`worktrees/design-system/`)
- **Primary**: Design system creation, glassmorphism components, micro-interaction libraries
- **Secondary**: Brand consistency, color theory application, typography systems
- **Technologies**: Design tokens, component documentation, animation presets
- **Focus**: 2025 UI trends, accessibility compliance, responsive design principles

### @frontend-agent (`worktrees/{usmanramzan-ai,urnlabs-ai,eprecisio-com}/`)
- **Primary**: Astro/React development, responsive layouts, performance optimization
- **Secondary**: TypeScript implementation, SEO optimization, analytics integration
- **Technologies**: Astro 4.x, React 18, TailwindCSS, Framer Motion
- **Focus**: Static site generation, S3/CDN optimization, Core Web Vitals

### @component-agent (`worktrees/shared-components/`)
- **Primary**: Reusable UI component library, interaction patterns, state management
- **Secondary**: Component testing, prop interface design, documentation
- **Technologies**: React + TypeScript, Storybook, Vitest testing
- **Focus**: Cross-site consistency, modularity, performance

### @content-agent (`worktrees/urnlabs-ai/`)
- **Primary**: Content strategy, copywriting, blog system, markdown processing
- **Secondary**: SEO content optimization, social media integration
- **Technologies**: MDX, content collections, headless CMS integration
- **Focus**: Technical content, thought leadership, user engagement

### @marketing-agent (`worktrees/eprecisio-com/`)
- **Primary**: Marketing website optimization, conversion funnels, lead generation
- **Secondary**: Analytics implementation, A/B testing setup, social proof
- **Technologies**: Marketing automation, conversion tracking, CRM integration
- **Focus**: B2B marketing, service positioning, client acquisition

### @infrastructure-agent (`worktrees/infrastructure/`)
- **Primary**: AWS deployment automation, CDN optimization, performance monitoring
- **Secondary**: CI/CD pipeline management, security implementation
- **Technologies**: AWS CDK, GitHub Actions, monitoring tools
- **Focus**: S3/CloudFront deployment, domain management, cost optimization

### @coordination-agent (Main repository oversight)
- **Primary**: Cross-site consistency, release coordination, integration testing
- **Secondary**: Performance budgets, accessibility audits, brand alignment
- **Focus**: Multi-site deployment orchestration, analytics consolidation

## Daily Workflow

1. **Morning Standup**: Each agent updates their progress in GitHub issues
2. **Coordination**: Cross-dependencies discussed in coordination issues  
3. **Development**: Parallel work in specialized worktrees
4. **Integration**: Regular merging and testing of shared components
5. **Deployment**: Coordinated releases across all three websites

## Communication Patterns

- Use `@agent-name` mentions in GitHub issues for coordination
- Create coordination issues for multi-site features
- Daily progress updates in agent-specific issues
- Weekly cross-agent integration meetings via issue discussions
EOF

# Create package.json for root workspace management
cat > package.json << 'EOF'
{
  "name": "website-platform-monorepo",
  "version": "1.0.0",
  "description": "Ultra-comprehensive 3-website platform with specialized agent coordination",
  "private": true,
  "type": "module",
  "workspaces": [
    "worktrees/usmanramzan-ai",
    "worktrees/urnlabs-ai", 
    "worktrees/eprecisio-com",
    "worktrees/shared-components",
    "worktrees/design-system",
    "packages/*"
  ],
  "scripts": {
    "dev:usmanramzan": "cd worktrees/usmanramzan-ai && npm run dev",
    "dev:urnlabs": "cd worktrees/urnlabs-ai && npm run dev", 
    "dev:eprecisio": "cd worktrees/eprecisio-com && npm run dev",
    "build:all": "npm run build:usmanramzan && npm run build:urnlabs && npm run build:eprecisio",
    "build:usmanramzan": "cd worktrees/usmanramzan-ai && npm run build",
    "build:urnlabs": "cd worktrees/urnlabs-ai && npm run build",
    "build:eprecisio": "cd worktrees/eprecisio-com && npm run build",
    "status": "./scripts/status-all-websites.sh",
    "sync": "./scripts/sync-all-websites.sh",
    "deploy:all": "npm run build:all && cd worktrees/infrastructure && npm run deploy:all"
  },
  "devDependencies": {
    "@types/node": "^20.10.5",
    "typescript": "^5.3.3"
  },
  "keywords": [
    "website-platform",
    "astro", 
    "react",
    "glassmorphism",
    "s3-deployment",
    "cdn-optimization",
    "agent-coordination"
  ],
  "author": "Muhammad Usman Ramzan",
  "license": "MIT"
}
EOF

echo -e "${GREEN}✨ Website Platform Worktrees Setup Complete!${NC}"
echo ""
echo -e "${CYAN}📋 Next Steps:${NC}"
echo -e "  1. Run: ${YELLOW}./scripts/status-all-websites.sh${NC} to check all worktrees"
echo -e "  2. Navigate to specific worktree: ${YELLOW}cd worktrees/usmanramzan-ai${NC}"
echo -e "  3. Start development: ${YELLOW}npm run dev:usmanramzan${NC}"
echo -e "  4. Check agent assignments: ${YELLOW}cat WEBSITE-AGENT-ASSIGNMENTS.md${NC}"
echo ""
echo -e "${PURPLE}🎯 Ready for specialized agent coordination!${NC}"