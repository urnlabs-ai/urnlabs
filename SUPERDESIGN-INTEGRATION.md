# Superdesign MCP Server Integration

## Overview

The Superdesign MCP Server has been successfully integrated into the Urnlabs AI Agent Platform. This integration provides advanced AI-powered design capabilities directly within Claude Code, enabling the creation of UI designs, wireframes, components, logos, and icons.

## Features

The superdesign MCP server provides the following tools:

### Core Design Tools
- **`superdesign_generate`** - Generate new designs from prompts
- **`superdesign_iterate`** - Iterate on existing designs with feedback
- **`superdesign_extract_system`** - Extract design systems from screenshots
- **`superdesign_list`** - List all created designs in the workspace

### Design Types Supported
- **UI Designs**: Complete responsive interfaces
- **Wireframes**: Minimal black and white layouts
- **Components**: Individual UI components (HTML/React/Vue)
- **Logos**: SVG logo designs
- **Icons**: SVG icon designs

## Installation & Setup

### 1. Repository Structure
The superdesign MCP server has been cloned and set up at:
```
packages/superdesign-mcp/
├── dist/index.js          # Built MCP server
├── src/                   # Source code
├── package.json          # Dependencies
└── README.md             # Documentation
```

### 2. MCP Configuration
The server has been added to the main `.mcp.json` configuration:

```json
{
  "mcpServers": {
    "superdesign": {
      "command": "node",
      "args": ["/Users/muhammadusmanramzan/Desktop/work/urnlabs-ai/urnlabs/packages/superdesign-mcp/dist/index.js"],
      "env": {
        "DESIGN_SYSTEM_PATH": "/Users/muhammadusmanramzan/Desktop/work/urnlabs-ai/urnlabs/.superdesign",
        "COMPONENT_LIBRARY": "shadcn-ui"
      }
    }
  }
}
```

### 3. Directory Structure
The following directory structure has been created for design artifacts:
```
.superdesign/
└── design_iterations/     # Generated designs are stored here
```

## Usage Examples

### Generate a UI Design
```
Ask Claude: "Generate a modern dashboard UI for analytics"
```
Claude will use the `superdesign_generate` tool to create:
- Multiple design variations
- Responsive HTML/CSS
- Clean, modern aesthetics

### Iterate on Existing Design
```
Ask Claude: "Improve the dashboard by making it more colorful and adding dark mode"
```
Claude will use the `superdesign_iterate` tool to:
- Analyze the existing design
- Apply your feedback
- Generate improved variations

### Extract Design System
```
Ask Claude: "Extract the design system from this screenshot"
```
Claude will use the `superdesign_extract_system` tool to:
- Analyze visual patterns
- Extract color palettes, typography, spacing
- Create reusable design system JSON

## Integration Benefits

### 1. No API Keys Required
- Works directly with Claude Code's built-in LLM connection
- No external API dependencies

### 2. Local Execution
- Runs entirely on your machine as an MCP server
- Complete privacy and control over design assets

### 3. IDE Integration
- Seamlessly integrates with Claude Code
- Direct file creation and management

### 4. Open Source Foundation
- Built on top of [Superdesign.dev](https://www.superdesign.dev)
- Transparent and extensible

## Configuration Options

### Environment Variables
- `DESIGN_SYSTEM_PATH`: Path where design files are stored
- `COMPONENT_LIBRARY`: Default component library (e.g., "shadcn-ui")

### Supported Frameworks
- HTML (default)
- React
- Vue

### Design Type Options
- `ui`: Complete user interfaces
- `wireframe`: Minimal layouts
- `component`: Individual components
- `logo`: Logo designs
- `icon`: Icon designs

## Troubleshooting

### Server Not Starting
1. Ensure Node.js 16+ is installed
2. Check that the dist/index.js file is executable
3. Verify the path in .mcp.json is correct

### Tools Not Available
1. Restart Claude Code after configuration changes
2. Check `.mcp.json` syntax is valid
3. Verify the superdesign directory structure exists

### Design Generation Issues
1. Ensure `.superdesign/design_iterations/` directory exists
2. Check file permissions for the design directory
3. Verify prompt clarity and specificity

## File Output Structure

Generated designs follow this naming convention:
```
.superdesign/design_iterations/
├── ui_dashboard_1.html
├── ui_dashboard_2.html
├── component_button_1.html
├── logo_brand_1.svg
└── icon_settings_1.svg
```

## Next Steps

1. **Test Design Generation**: Try generating your first design
2. **Customize Configuration**: Adjust environment variables as needed
3. **Integrate with Workflow**: Use in your development process
4. **Explore Advanced Features**: Try design system extraction and iteration

## Related Documentation

- [CLAUDE.md](./CLAUDE.md) - Main development guidelines
- [MCP-SUBAGENT-TEMPLATE.md](./MCP-SUBAGENT-TEMPLATE.md) - MCP server configuration template
- [Superdesign Repository](https://github.com/jonthebeef/superdesign-mcp-claude-code) - Original MCP server source

---

**The Superdesign MCP Server is now ready for use in your Urnlabs AI Agent Platform development workflow.**