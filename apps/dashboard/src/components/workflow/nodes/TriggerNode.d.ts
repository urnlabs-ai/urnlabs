import React from 'react';
import { NodeProps } from 'reactflow';
interface TriggerNodeData {
    label: string;
    triggerType: 'manual' | 'schedule' | 'webhook' | 'email' | 'database' | 'event';
    config?: Record<string, any>;
}
export declare const TriggerNode: React.FC<NodeProps<TriggerNodeData>>;
export {};
//# sourceMappingURL=TriggerNode.d.ts.map