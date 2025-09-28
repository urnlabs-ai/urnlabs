import React from 'react';
import { NodeProps } from 'reactflow';
interface ActionNodeData {
    label: string;
    actionType: 'api-call' | 'email' | 'database' | 'file-operation' | 'notification' | 'ai-agent' | 'script' | 'webhook';
    config?: Record<string, any>;
    status?: 'idle' | 'running' | 'success' | 'error';
}
export declare const ActionNode: React.FC<NodeProps<ActionNodeData>>;
export {};
//# sourceMappingURL=ActionNode.d.ts.map