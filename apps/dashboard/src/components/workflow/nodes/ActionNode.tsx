import React from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Card, CardContent, Badge } from '@urnlabs/ui'
import {
  Globe,
  Mail,
  Database,
  FileText,
  MessageSquare,
  Zap,
  Code,
  Send,
  Bot,
  Cloud
} from 'lucide-react'

interface ActionNodeData {
  label: string
  actionType: 'api-call' | 'email' | 'database' | 'file-operation' | 'notification' | 'ai-agent' | 'script' | 'webhook'
  config?: Record<string, any>
  status?: 'idle' | 'running' | 'success' | 'error'
}

const actionIcons = {
  'api-call': Globe,
  'email': Mail,
  'database': Database,
  'file-operation': FileText,
  'notification': MessageSquare,
  'ai-agent': Bot,
  'script': Code,
  'webhook': Send,
}

const actionColors = {
  'api-call': 'bg-blue-100 text-blue-800 border-blue-200',
  'email': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'database': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'file-operation': 'bg-purple-100 text-purple-800 border-purple-200',
  'notification': 'bg-green-100 text-green-800 border-green-200',
  'ai-agent': 'bg-orange-100 text-orange-800 border-orange-200',
  'script': 'bg-gray-100 text-gray-800 border-gray-200',
  'webhook': 'bg-pink-100 text-pink-800 border-pink-200',
}

const statusColors = {
  idle: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-600 animate-pulse',
  success: 'bg-green-100 text-green-600',
  error: 'bg-red-100 text-red-600',
}

export const ActionNode: React.FC<NodeProps<ActionNodeData>> = ({ data, selected }) => {
  const Icon = actionIcons[data.actionType] || Zap

  return (
    <Card className={`min-w-[200px] ${selected ? 'ring-2 ring-primary' : ''}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-md bg-blue-100 flex items-center justify-center">
            <Icon className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">{data.label}</div>
            <div className="flex gap-1 mt-1">
              <Badge variant="outline" className={actionColors[data.actionType]}>
                {data.actionType.replace('-', ' ')}
              </Badge>
              {data.status && (
                <Badge variant="outline" className={statusColors[data.status]}>
                  {data.status}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mb-2">
          {getActionDescription(data.actionType)}
        </div>

        {data.config && (
          <div className="text-xs bg-muted p-2 rounded">
            {Object.entries(data.config).slice(0, 3).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="capitalize">{key}:</span>
                <span className="font-medium truncate ml-2" title={String(value)}>
                  {String(value).length > 15 ? `${String(value).slice(0, 15)}...` : String(value)}
                </span>
              </div>
            ))}
            {Object.keys(data.config).length > 3 && (
              <div className="text-center mt-1 text-muted-foreground">
                +{Object.keys(data.config).length - 3} more
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-blue-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-blue-500"
      />
    </Card>
  )
}

function getActionDescription(type: string): string {
  switch (type) {
    case 'api-call':
      return 'Make HTTP API request to external service'
    case 'email':
      return 'Send email notification or message'
    case 'database':
      return 'Perform database operations (CRUD)'
    case 'file-operation':
      return 'Read, write, or manipulate files'
    case 'notification':
      return 'Send push notifications or alerts'
    case 'ai-agent':
      return 'Execute AI agent with specific task'
    case 'script':
      return 'Run custom script or code'
    case 'webhook':
      return 'Send data to webhook endpoint'
    default:
      return 'Perform specific action or task'
  }
}