import React from 'react';
import { NodeProps } from 'reactflow';
interface ConditionNodeData {
    label: string;
    conditionType: 'if-else' | 'loop' | 'filter' | 'switch' | 'retry' | 'timeout' | 'probability';
    config?: Record<string, any>;
    evaluation?: 'pending' | 'true' | 'false' | 'error';
}
export declare const ConditionNode: React.FC<NodeProps<ConditionNodeData>>;
export {};
//# sourceMappingURL=ConditionNode.d.ts.map