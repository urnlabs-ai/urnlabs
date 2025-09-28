#!/bin/bash

# Production Build Script for UrnLabs AI Platform Sites
# Builds both urnlabs.ai and usmanramzan.ai for production deployment

set -e

echo "🚀 Building UrnLabs AI Platform Sites for Production"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

# Create build directory
mkdir -p dist

# Build UrnLabs.ai
print_status "Building UrnLabs.ai..."
cd apps/urnlabs
npm run build
if [ $? -eq 0 ]; then
    print_success "UrnLabs.ai build completed"
    cp -r dist ../../dist/urnlabs
else
    print_error "UrnLabs.ai build failed"
    exit 1
fi
cd ../..

# Build UsmanRamzan.ai
print_status "Building UsmanRamzan.ai..."
cd apps/usmanramzan-ai
npm run build
if [ $? -eq 0 ]; then
    print_success "UsmanRamzan.ai build completed"
    cp -r dist ../../dist/usmanramzan-ai
else
    print_error "UsmanRamzan.ai build failed"
    exit 1
fi
cd ../..

# Create deployment info
cat > dist/deployment-info.json << EOF
{
  "buildDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "sites": {
    "urnlabs": {
      "domain": "urnlabs.ai",
      "path": "./urnlabs",
      "status": "ready"
    },
    "usmanramzan": {
      "domain": "usmanramzan.ai",
      "path": "./usmanramzan-ai",
      "status": "ready"
    }
  },
  "version": "1.0.0"
}
EOF

print_success "✅ All sites built successfully!"
print_status "📦 Build artifacts available in: ./dist/"
print_status "🌐 UrnLabs.ai: ./dist/urnlabs/"
print_status "🧠 UsmanRamzan.ai: ./dist/usmanramzan-ai/"
print_status "📋 Deployment info: ./dist/deployment-info.json"

echo ""
echo "🚀 Ready for production deployment!"