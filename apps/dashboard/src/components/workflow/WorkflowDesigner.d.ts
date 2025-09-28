import React from 'react';
import { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
interface WorkflowDesignerProps {
    workflowId?: string;
    onSave?: (nodes: Node[], edges: Edge[]) => void;
    onRun?: () => void;
    readOnly?: boolean;
}
export declare const WorkflowDesigner: React.FC<WorkflowDesignerProps>;
export declare const WorkflowDesignerProvider: React.FC<{
    children: React.ReactNode;
}>;
export {};
//# sourceMappingURL=WorkflowDesigner.d.ts.map