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
