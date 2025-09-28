import React from 'react';
import { Node, Edge } from 'reactflow';
interface WorkflowTemplate {
    id: string;
    name: string;
    description: string;
    category: 'automation' | 'data' | 'communication' | 'ai' | 'monitoring';
    complexity: 'simple' | 'intermediate' | 'advanced';
    estimatedTime: string;
    tags: string[];
    nodes: Node[];
    edges: Edge[];
    icon: React.ComponentType<any>;
    previewImage?: string;
    usageCount: number;
    rating: number;
}
interface WorkflowTemplatesProps {
    onSelectTemplate: (template: WorkflowTemplate) => void;
}
export declare const WorkflowTemplates: React.FC<WorkflowTemplatesProps>;
export {};
//# sourceMappingURL=WorkflowTemplates.d.ts.map