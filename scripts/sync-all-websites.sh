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
