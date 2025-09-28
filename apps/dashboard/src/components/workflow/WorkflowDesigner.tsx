import React, { useCallback, useRef, useState } from 'react'
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  ConnectionMode,
  Panel,
  ReactFlowProvider,
  ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { Button, Card, CardContent, CardHeader, CardTitle } from '@urnlabs/ui'
import { Play, Save, Download, Upload, Undo, Redo, Zap, Settings, Plus, Cog, Activity, Template } from 'lucide-react'

// Custom Node Types
import { TriggerNode } from './nodes/TriggerNode'
import { ActionNode } from './nodes/ActionNode'
import { ConditionNode } from './nodes/ConditionNode'
import { OutputNode } from './nodes/OutputNode'

// Workflow Components
import { WorkflowConfigPanel } from './WorkflowConfigPanel'
import { WorkflowTemplates } from './WorkflowTemplates'
import { WorkflowExecutionPanel } from './WorkflowExecutionPanel'

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  output: OutputNode,
}

const initialNodes: Node[] = [
  {
    id: 'start',
    type: 'trigger',
    position: { x: 250, y: 25 },
    data: {
      label: 'Workflow Start',
      triggerType: 'manual',
      config: {
        description: 'Manual trigger to start the workflow'
      }
    },
  },
]

const initialEdges: Edge[] = []

interface WorkflowDesignerProps {
  workflowId?: string
  onSave?: (nodes: Node[], edges: Edge[]) => void
  onRun?: () => void
  readOnly?: boolean
}

export const WorkflowDesigner: React.FC<WorkflowDesignerProps> = ({
  workflowId,
  onSave,
  onRun,
  readOnly = false
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [isValidFlow, setIsValidFlow] = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false)
  const [isExecutionPanelOpen, setIsExecutionPanelOpen] = useState(false)

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds))
    },
    [setEdges]
  )

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance)
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      if (!reactFlowWrapper.current || !reactFlowInstance) return

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect()
      const type = event.dataTransfer.getData('application/reactflow')

      if (!type) return

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      })

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: {
          label: `New ${type}`,
          ...(type === 'action' && { actionType: 'api-call' }),
          ...(type === 'condition' && { conditionType: 'if-else' }),
          ...(type === 'trigger' && { triggerType: 'schedule' }),
        },
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [reactFlowInstance, setNodes]
  )

  const validateWorkflow = useCallback(() => {
    // Check if workflow has at least one trigger and one output
    const hasTrigger = nodes.some(node => node.type === 'trigger')
    const hasOutput = nodes.some(node => node.type === 'output')
    const hasConnections = edges.length > 0

    setIsValidFlow(hasTrigger && hasOutput && hasConnections)
  }, [nodes, edges])

  React.useEffect(() => {
    validateWorkflow()
  }, [validateWorkflow])

  const handleSave = () => {
    if (onSave) {
      onSave(nodes, edges)
    }
  }

  const handleRun = () => {
    if (isValidFlow && onRun) {
      onRun()
    }
  }

  const handleExport = () => {
    const workflowData = {
      nodes,
      edges,
      metadata: {
        created: new Date().toISOString(),
        version: '1.0.0'
      }
    }

    const dataStr = JSON.stringify(workflowData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)

    const link = document.createElement('a')
    link.href = url
    link.download = `workflow-${workflowId || 'export'}.json`
    link.click()

    URL.revokeObjectURL(url)
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workflowData = JSON.parse(e.target?.result as string)
        if (workflowData.nodes && workflowData.edges) {
          setNodes(workflowData.nodes)
          setEdges(workflowData.edges)
        }
      } catch (error) {
        console.error('Failed to import workflow:', error)
      }
    }
    reader.readAsText(file)
  }

  const addNode = (type: string) => {
    const position = { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 }
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: {
        label: `New ${type}`,
        ...(type === 'action' && { actionType: 'api-call' }),
        ...(type === 'condition' && { conditionType: 'if-else' }),
        ...(type === 'trigger' && { triggerType: 'schedule' }),
        ...(type === 'output' && { outputType: 'success' }),
      },
    }
    setNodes((nds) => [...nds, newNode])
  }

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    setIsConfigPanelOpen(true)
  }, [])

  const handleUpdateNode = (nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      )
    )
  }

  const handleDeleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId))
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
  }

  const handleDuplicateNode = (nodeId: string) => {
    const nodeToDuplicate = nodes.find((node) => node.id === nodeId)
    if (nodeToDuplicate) {
      const newNode: Node = {
        ...nodeToDuplicate,
        id: `${nodeToDuplicate.type}-${Date.now()}`,
        position: {
          x: nodeToDuplicate.position.x + 50,
          y: nodeToDuplicate.position.y + 50,
        },
        data: {
          ...nodeToDuplicate.data,
          label: `${nodeToDuplicate.data.label} (Copy)`,
        },
      }
      setNodes((nds) => [...nds, newNode])
    }
  }

  const handleSelectTemplate = (template: any) => {
    setNodes(template.nodes)
    setEdges(template.edges)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Workflow Designer</CardTitle>
            <div className="flex items-center gap-2">
              {!readOnly && (
                <>
                  <WorkflowTemplates onSelectTemplate={handleSelectTemplate} />
                  <Button variant="outline" size="sm" onClick={() => addNode('trigger')}>
                    <Plus className="h-3 w-3 mr-1" />
                    Trigger
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addNode('action')}>
                    <Plus className="h-3 w-3 mr-1" />
                    Action
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addNode('condition')}>
                    <Plus className="h-3 w-3 mr-1" />
                    Condition
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addNode('output')}>
                    <Plus className="h-3 w-3 mr-1" />
                    Output
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!readOnly && (
                <>
                  <Button variant="outline" size="sm" onClick={handleSave}>
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="h-3 w-3 mr-1" />
                    Export
                  </Button>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImport}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      id="import-workflow"
                    />
                    <Button variant="outline" size="sm" asChild>
                      <label htmlFor="import-workflow" className="cursor-pointer">
                        <Upload className="h-3 w-3 mr-1" />
                        Import
                      </label>
                    </Button>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedNode && !readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConfigPanelOpen(true)}
                >
                  <Cog className="h-3 w-3 mr-1" />
                  Configure
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExecutionPanelOpen(true)}
              >
                <Activity className="h-3 w-3 mr-1" />
                Simulate
              </Button>
              <div className={`px-2 py-1 rounded text-xs ${
                isValidFlow
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {isValidFlow ? 'Valid Workflow' : 'Incomplete Workflow'}
              </div>
              <Button
                onClick={handleRun}
                disabled={!isValidFlow}
                size="sm"
                className="gap-1"
              >
                <Play className="h-3 w-3" />
                Run Workflow
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flow Canvas */}
      <div className="flex-1 border rounded-lg overflow-hidden bg-background">
        <div ref={reactFlowWrapper} className="h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={onInit}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView
            attributionPosition="bottom-left"
          >
            <Background />
            <Controls />
            <MiniMap
              nodeStrokeColor={(n) => {
                switch (n.type) {
                  case 'trigger': return '#10b981'
                  case 'action': return '#3b82f6'
                  case 'condition': return '#f59e0b'
                  case 'output': return '#ef4444'
                  default: return '#6b7280'
                }
              }}
              nodeColor={(n) => {
                switch (n.type) {
                  case 'trigger': return '#d1fae5'
                  case 'action': return '#dbeafe'
                  case 'condition': return '#fef3c7'
                  case 'output': return '#fee2e2'
                  default: return '#f3f4f6'
                }
              }}
              nodeBorderRadius={8}
            />
            <Panel position="top-right">
              <Card className="w-48 p-2">
                <div className="text-xs font-medium mb-2">Workflow Stats</div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>Nodes: {nodes.length}</div>
                  <div>Connections: {edges.length}</div>
                  <div>Status: {isValidFlow ? 'Ready' : 'Incomplete'}</div>
                </div>
              </Card>
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {/* Configuration Panel */}
      <WorkflowConfigPanel
        isOpen={isConfigPanelOpen}
        onClose={() => setIsConfigPanelOpen(false)}
        selectedNode={selectedNode}
        onUpdateNode={handleUpdateNode}
        onDeleteNode={handleDeleteNode}
        onDuplicateNode={handleDuplicateNode}
      />

      {/* Execution Panel */}
      <WorkflowExecutionPanel
        isOpen={isExecutionPanelOpen}
        onClose={() => setIsExecutionPanelOpen(false)}
        nodes={nodes}
        edges={edges}
        onExecute={onRun}
      />
    </div>
  )
}

export const WorkflowDesignerProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  return (
    <ReactFlowProvider>
      {children}
    </ReactFlowProvider>
  )
}