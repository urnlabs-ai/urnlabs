import React from 'react';
import { NodeProps } from 'reactflow';
interface OutputNodeData {
    label: string;
    outputType: 'success' | 'error' | 'file' | 'database' | 'email' | 'notification' | 'archive' | 'export';
    config?: Record<string, any>;
    status?: 'pending' | 'completed' | 'failed';
    result?: any;
}
export declare const OutputNode: React.FC<NodeProps<OutputNodeData>>;
export {};
//# sourceMappingURL=OutputNode.d.ts.map