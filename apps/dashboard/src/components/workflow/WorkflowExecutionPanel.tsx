import React, { useState, useEffect } from 'react'
import { Node, Edge } from 'reactflow'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  ScrollArea,
  Progress,
  Separator,
  Alert,
  AlertDescription
} from '@urnlabs/ui'
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Activity,
  FileText,
  Calendar,
  Timer,
  Zap,
  TrendingUp,
  Database,
  Mail,
  Globe,
  Bot,
  Code,
  Send,
  MessageSquare
} from 'lucide-react'

interface ExecutionStep {
  id: string
  nodeId: string
  nodeName: string
  nodeType: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startTime?: Date
  endTime?: Date
  duration?: number
  input?: any
  output?: any
  error?: string
  logs?: string[]
}

interface WorkflowExecution {
  id: string
  workflowId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  startTime: Date
  endTime?: Date
  duration?: number
  steps: ExecutionStep[]
  progress: number
  totalSteps: number
  completedSteps: number
  failedSteps: number
}

interface WorkflowExecutionPanelProps {
  isOpen: boolean
  onClose: () => void
  nodes: Node[]
  edges: Edge[]
  onExecute?: (executionId: string) => void
}

export const WorkflowExecutionPanel: React.FC<WorkflowExecutionPanelProps> = ({
  isOpen,
  onClose,
  nodes,
  edges,
  onExecute
}) => {
  const [execution, setExecution] = useState<WorkflowExecution | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [selectedStep, setSelectedStep] = useState<ExecutionStep | null>(null)

  // Mock execution data for demonstration
  const mockExecution: WorkflowExecution = {
    id: 'exec-1',
    workflowId: 'workflow-1',
    status: 'pending',
    startTime: new Date(),
    steps: nodes.map((node, index) => ({
      id: `step-${index}`,
      nodeId: node.id,
      nodeName: node.data.label,
      nodeType: node.type || 'unknown',
      status: 'pending',
      logs: []
    })),
    progress: 0,
    totalSteps: nodes.length,
    completedSteps: 0,
    failedSteps: 0
  }

  useEffect(() => {
    if (isOpen && !execution) {
      setExecution(mockExecution)
    }
  }, [isOpen])

  const simulateExecution = async () => {
    if (!execution) return

    setIsSimulating(true)
    setExecution(prev => prev ? { ...prev, status: 'running', startTime: new Date() } : null)

    // Simulate execution steps
    for (let i = 0; i < execution.steps.length; i++) {
      const step = execution.steps[i]

      // Start step
      setExecution(prev => {
        if (!prev) return null
        const updatedSteps = [...prev.steps]
        updatedSteps[i] = {
          ...step,
          status: 'running',
          startTime: new Date(),
          logs: [...(step.logs || []), `Starting ${step.nodeName} execution...`]
        }
        return {
          ...prev,
          steps: updatedSteps,
          progress: Math.round((i / prev.totalSteps) * 100)
        }
      })

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))

      // Complete step (90% success rate)
      const isSuccess = Math.random() > 0.1
      setExecution(prev => {
        if (!prev) return null
        const updatedSteps = [...prev.steps]
        const endTime = new Date()
        const duration = step.startTime ? endTime.getTime() - step.startTime.getTime() : 0

        updatedSteps[i] = {
          ...step,
          status: isSuccess ? 'completed' : 'failed',
          endTime,
          duration,
          output: isSuccess ? generateMockOutput(step.nodeType) : undefined,
          error: isSuccess ? undefined : generateMockError(step.nodeType),
          logs: [
            ...(step.logs || []),
            isSuccess
              ? `${step.nodeName} completed successfully in ${duration}ms`
              : `${step.nodeName} failed: ${generateMockError(step.nodeType)}`
          ]
        }

        const completedSteps = updatedSteps.filter(s => s.status === 'completed').length
        const failedSteps = updatedSteps.filter(s => s.status === 'failed').length

        return {
          ...prev,
          steps: updatedSteps,
          progress: Math.round(((i + 1) / prev.totalSteps) * 100),
          completedSteps,
          failedSteps
        }
      })

      // If step failed, stop execution
      if (!isSuccess) {
        setExecution(prev => prev ? {
          ...prev,
          status: 'failed',
          endTime: new Date(),
          duration: new Date().getTime() - prev.startTime.getTime()
        } : null)
        setIsSimulating(false)
        return
      }
    }

    // Complete execution
    setExecution(prev => prev ? {
      ...prev,
      status: 'completed',
      endTime: new Date(),
      duration: new Date().getTime() - prev.startTime.getTime(),
      progress: 100
    } : null)
    setIsSimulating(false)
  }

  const stopExecution = () => {
    setIsSimulating(false)
    setExecution(prev => prev ? {
      ...prev,
      status: 'cancelled',
      endTime: new Date(),
      duration: prev.startTime ? new Date().getTime() - prev.startTime.getTime() : 0
    } : null)
  }

  const resetExecution = () => {
    setIsSimulating(false)
    setExecution(mockExecution)
    setSelectedStep(null)
  }

  const generateMockOutput = (nodeType: string) => {
    switch (nodeType) {
      case 'trigger':
        return { triggerId: 'trg-123', timestamp: new Date().toISOString() }
      case 'action':
        return { actionId: 'act-456', result: 'success', data: { processed: 42 } }
      case 'condition':
        return { conditionMet: true, value: Math.random() > 0.5 }
      case 'output':
        return { outputId: 'out-789', status: 'saved', location: '/outputs/result.json' }
      default:
        return { status: 'completed' }
    }
  }

  const generateMockError = (nodeType: string) => {
    const errors = [
      'Connection timeout',
      'Invalid response format',
      'Authentication failed',
      'Rate limit exceeded',
      'Service unavailable'
    ]
    return errors[Math.floor(Math.random() * errors.length)]
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-500" />
      case 'running':
        return <Activity className="h-4 w-4 text-blue-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'cancelled':
        return <Square className="h-4 w-4 text-gray-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 text-gray-600'
      case 'running':
        return 'bg-blue-100 text-blue-600'
      case 'completed':
        return 'bg-green-100 text-green-600'
      case 'failed':
        return 'bg-red-100 text-red-600'
      case 'cancelled':
        return 'bg-gray-100 text-gray-600'
      default:
        return 'bg-gray-100 text-gray-600'
    }
  }

  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
      case 'trigger':
        return <Zap className="h-4 w-4" />
      case 'action':
        return <Activity className="h-4 w-4" />
      case 'condition':
        return <AlertCircle className="h-4 w-4" />
      case 'output':
        return <FileText className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString()
  }

  if (!execution) return null

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[500px] sm:w-[600px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Workflow Execution
          </SheetTitle>
          <SheetDescription>
            Monitor and control workflow execution in real-time.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Execution Status */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  {getStatusIcon(execution.status)}
                  Execution Status
                </CardTitle>
                <Badge className={getStatusColor(execution.status)}>
                  {execution.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Progress</span>
                  <span>{execution.progress}%</span>
                </div>
                <Progress value={execution.progress} />
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-lg font-semibold text-green-600">
                    {execution.completedSteps}
                  </div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-red-600">
                    {execution.failedSteps}
                  </div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
                <div>
                  <div className="text-lg font-semibold">
                    {execution.totalSteps}
                  </div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Started:</span>
                  <div className="font-medium">{formatTime(execution.startTime)}</div>
                </div>
                {execution.duration && (
                  <div>
                    <span className="text-muted-foreground">Duration:</span>
                    <div className="font-medium">{formatDuration(execution.duration)}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Controls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {execution.status === 'pending' || execution.status === 'failed' || execution.status === 'cancelled' ? (
                  <Button
                    onClick={simulateExecution}
                    disabled={isSimulating}
                    className="flex-1"
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Start Execution
                  </Button>
                ) : execution.status === 'running' ? (
                  <Button
                    onClick={stopExecution}
                    variant="destructive"
                    className="flex-1"
                  >
                    <Square className="h-3 w-3 mr-1" />
                    Stop Execution
                  </Button>
                ) : null}

                <Button
                  onClick={resetExecution}
                  variant="outline"
                  disabled={isSimulating}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Execution Steps */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Execution Steps</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                <div className="space-y-1 p-3">
                  {execution.steps.map((step, index) => (
                    <div
                      key={step.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedStep?.id === step.id
                          ? 'bg-accent border-primary'
                          : 'hover:bg-accent/50'
                      }`}
                      onClick={() => setSelectedStep(step)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            {getNodeIcon(step.nodeType)}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{step.nodeName}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {step.nodeType}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {step.duration && (
                            <span className="text-xs text-muted-foreground">
                              {formatDuration(step.duration)}
                            </span>
                          )}
                          {getStatusIcon(step.status)}
                        </div>
                      </div>

                      {step.error && (
                        <Alert className="mt-2">
                          <AlertCircle className="h-3 w-3" />
                          <AlertDescription className="text-xs">
                            {step.error}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Step Details */}
          {selectedStep && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  {getNodeIcon(selectedStep.nodeType)}
                  {selectedStep.nodeName} Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <div className="flex items-center gap-1 mt-1">
                      {getStatusIcon(selectedStep.status)}
                      <span className="capitalize">{selectedStep.status}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <div className="capitalize mt-1">{selectedStep.nodeType}</div>
                  </div>
                  {selectedStep.startTime && (
                    <div>
                      <span className="text-muted-foreground">Started:</span>
                      <div className="mt-1">{formatTime(selectedStep.startTime)}</div>
                    </div>
                  )}
                  {selectedStep.duration && (
                    <div>
                      <span className="text-muted-foreground">Duration:</span>
                      <div className="mt-1">{formatDuration(selectedStep.duration)}</div>
                    </div>
                  )}
                </div>

                {selectedStep.logs && selectedStep.logs.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-xs font-medium mb-2">Logs</div>
                      <div className="bg-muted p-2 rounded text-xs font-mono space-y-1 max-h-32 overflow-y-auto">
                        {selectedStep.logs.map((log, index) => (
                          <div key={index}>{log}</div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {selectedStep.output && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-xs font-medium mb-2">Output</div>
                      <div className="bg-green-50 p-2 rounded text-xs font-mono">
                        <pre>{JSON.stringify(selectedStep.output, null, 2)}</pre>
                      </div>
                    </div>
                  </>
                )}

                {selectedStep.error && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-xs font-medium mb-2 text-red-600">Error</div>
                      <div className="bg-red-50 p-2 rounded text-xs text-red-800">
                        {selectedStep.error}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}