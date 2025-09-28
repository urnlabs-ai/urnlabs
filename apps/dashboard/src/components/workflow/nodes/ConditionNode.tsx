import React from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Card, CardContent, Badge } from '@urnlabs/ui'
import {
  GitBranch,
  RotateCcw,
  Filter,
  CheckCircle,
  XCircle,
  Timer,
  Percent,
  Hash
} from 'lucide-react'

interface ConditionNodeData {
  label: string
  conditionType: 'if-else' | 'loop' | 'filter' | 'switch' | 'retry' | 'timeout' | 'probability'
  config?: Record<string, any>
  evaluation?: 'pending' | 'true' | 'false' | 'error'
}

const conditionIcons = {
  'if-else': GitBranch,
  'loop': RotateCcw,
  'filter': Filter,
  'switch': Hash,
  'retry': RotateCcw,
  'timeout': Timer,
  'probability': Percent,
}

const conditionColors = {
  'if-else': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'loop': 'bg-purple-100 text-purple-800 border-purple-200',
  'filter': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'switch': 'bg-orange-100 text-orange-800 border-orange-200',
  'retry': 'bg-red-100 text-red-800 border-red-200',
  'timeout': 'bg-blue-100 text-blue-800 border-blue-200',
  'probability': 'bg-green-100 text-green-800 border-green-200',
}

const evaluationColors = {
  pending: 'bg-gray-100 text-gray-600',
  true: 'bg-green-100 text-green-600',
  false: 'bg-red-100 text-red-600',
  error: 'bg-orange-100 text-orange-600',
}

export const ConditionNode: React.FC<NodeProps<ConditionNodeData>> = ({ data, selected }) => {
  const Icon = conditionIcons[data.conditionType] || GitBranch

  const getHandles = () => {
    switch (data.conditionType) {
      case 'if-else':
        return (
          <>
            <Handle
              type="source"
              position={Position.Right}
              id="true"
              className="w-3 h-3 bg-green-500"
              style={{ top: '70%' }}
            />
            <Handle
              type="source"
              position={Position.Left}
              id="false"
              className="w-3 h-3 bg-red-500"
              style={{ top: '70%' }}
            />
          </>
        )
      case 'switch':
        return (
          <>
            <Handle
              type="source"
              position={Position.Right}
              id="case1"
              className="w-3 h-3 bg-blue-500"
              style={{ top: '60%' }}
            />
            <Handle
              type="source"
              position={Position.Right}
              id="case2"
              className="w-3 h-3 bg-purple-500"
              style={{ top: '80%' }}
            />
            <Handle
              type="source"
              position={Position.Left}
              id="default"
              className="w-3 h-3 bg-gray-500"
              style={{ top: '70%' }}
            />
          </>
        )
      default:
        return (
          <Handle
            type="source"
            position={Position.Bottom}
            className="w-3 h-3 bg-yellow-500"
          />
        )
    }
  }

  return (
    <Card className={`min-w-[200px] ${selected ? 'ring-2 ring-primary' : ''}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-md bg-yellow-100 flex items-center justify-center">
            <Icon className="h-4 w-4 text-yellow-600" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">{data.label}</div>
            <div className="flex gap-1 mt-1">
              <Badge variant="outline" className={conditionColors[data.conditionType]}>
                {data.conditionType}
              </Badge>
              {data.evaluation && (
                <Badge variant="outline" className={evaluationColors[data.evaluation]}>
                  {data.evaluation === 'true' ? <CheckCircle className="h-3 w-3" /> :
                   data.evaluation === 'false' ? <XCircle className="h-3 w-3" /> :
                   data.evaluation}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mb-2">
          {getConditionDescription(data.conditionType)}
        </div>

        {data.config && (
          <div className="text-xs bg-muted p-2 rounded">
            {Object.entries(data.config).slice(0, 2).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="capitalize">{key}:</span>
                <span className="font-medium truncate ml-2" title={String(value)}>
                  {String(value).length > 12 ? `${String(value).slice(0, 12)}...` : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Condition-specific output labels */}
        {data.conditionType === 'if-else' && (
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span className="text-red-600">FALSE</span>
            <span className="text-green-600">TRUE</span>
          </div>
        )}

        {data.conditionType === 'switch' && (
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span className="text-gray-600">DEFAULT</span>
            <div className="flex gap-2">
              <span className="text-blue-600">CASE1</span>
              <span className="text-purple-600">CASE2</span>
            </div>
          </div>
        )}
      </CardContent>

      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-yellow-500"
      />
      {getHandles()}
    </Card>
  )
}

function getConditionDescription(type: string): string {
  switch (type) {
    case 'if-else':
      return 'Branch workflow based on condition'
    case 'loop':
      return 'Repeat actions while condition is true'
    case 'filter':
      return 'Filter data based on criteria'
    case 'switch':
      return 'Multiple condition branching'
    case 'retry':
      return 'Retry failed operations'
    case 'timeout':
      return 'Time-based condition check'
    case 'probability':
      return 'Random probability-based branching'
    default:
      return 'Conditional workflow control'
  }
}