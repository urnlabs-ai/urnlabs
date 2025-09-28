import React from 'react';
import { Node, Edge } from 'reactflow';
interface WorkflowExecutionPanelProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: Node[];
    edges: Edge[];
    onExecute?: (executionId: string) => void;
}
export declare const WorkflowExecutionPanel: React.FC<WorkflowExecutionPanelProps>;
export {};
//# sourceMappingURL=WorkflowExecutionPanel.d.ts.map