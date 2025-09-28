import React from 'react';
import { Node } from 'reactflow';
interface WorkflowConfigPanelProps {
    isOpen: boolean;
    onClose: () => void;
    selectedNode: Node | null;
    onUpdateNode: (nodeId: string, data: any) => void;
    onDeleteNode: (nodeId: string) => void;
    onDuplicateNode: (nodeId: string) => void;
}
export declare const WorkflowConfigPanel: React.FC<WorkflowConfigPanelProps>;
export {};
//# sourceMappingURL=WorkflowConfigPanel.d.ts.map