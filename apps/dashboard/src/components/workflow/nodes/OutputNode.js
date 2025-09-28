import React from 'react';
import { Handle, Position } from 'reactflow';
import { Card, CardContent, Badge } from '@urnlabs/ui';
import { CheckCircle, XCircle, FileText, Database, Mail, Bell, Archive, Download } from 'lucide-react';
const outputIcons = {
    'success': CheckCircle,
    'error': XCircle,
    'file': FileText,
    'database': Database,
    'email': Mail,
    'notification': Bell,
    'archive': Archive,
    'export': Download,
};
const outputColors = {
    'success': 'bg-green-100 text-green-800 border-green-200',
    'error': 'bg-red-100 text-red-800 border-red-200',
    'file': 'bg-blue-100 text-blue-800 border-blue-200',
    'database': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    'email': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'notification': 'bg-purple-100 text-purple-800 border-purple-200',
    'archive': 'bg-gray-100 text-gray-800 border-gray-200',
    'export': 'bg-orange-100 text-orange-800 border-orange-200',
};
const statusColors = {
    pending: 'bg-gray-100 text-gray-600',
    completed: 'bg-green-100 text-green-600',
    failed: 'bg-red-100 text-red-600',
};
export const OutputNode = ({ data, selected }) => {
    const Icon = outputIcons[data.outputType] || CheckCircle;
    return (<Card className={`min-w-[200px] ${selected ? 'ring-2 ring-primary' : ''}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-md bg-red-100 flex items-center justify-center">
            <Icon className="h-4 w-4 text-red-600"/>
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">{data.label}</div>
            <div className="flex gap-1 mt-1">
              <Badge variant="outline" className={outputColors[data.outputType]}>
                {data.outputType}
              </Badge>
              {data.status && (<Badge variant="outline" className={statusColors[data.status]}>
                  {data.status}
                </Badge>)}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mb-2">
          {getOutputDescription(data.outputType)}
        </div>

        {data.config && (<div className="text-xs bg-muted p-2 rounded mb-2">
            {Object.entries(data.config).slice(0, 2).map(([key, value]) => (<div key={key} className="flex justify-between">
                <span className="capitalize">{key}:</span>
                <span className="font-medium truncate ml-2" title={String(value)}>
                  {String(value).length > 12 ? `${String(value).slice(0, 12)}...` : String(value)}
                </span>
              </div>))}
          </div>)}

        {data.result && (<div className="text-xs bg-green-50 p-2 rounded border border-green-200">
            <div className="font-medium text-green-800 mb-1">Result:</div>
            <div className="text-green-700">
              {typeof data.result === 'string'
                ? (data.result.length > 20 ? `${data.result.slice(0, 20)}...` : data.result)
                : JSON.stringify(data.result).slice(0, 30) + '...'}
            </div>
          </div>)}

        {/* Output specific indicators */}
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-muted-foreground">Workflow End</span>
          {data.outputType === 'success' && (<div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="h-3 w-3"/>
              Complete
            </div>)}
          {data.outputType === 'error' && (<div className="flex items-center gap-1 text-red-600">
              <XCircle className="h-3 w-3"/>
              Failed
            </div>)}
        </div>
      </CardContent>

      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-red-500"/>
    </Card>);
};
function getOutputDescription(type) {
    switch (type) {
        case 'success':
            return 'Successful workflow completion';
        case 'error':
            return 'Error handling and logging';
        case 'file':
            return 'Save output to file system';
        case 'database':
            return 'Store results in database';
        case 'email':
            return 'Send results via email';
        case 'notification':
            return 'Send notification with results';
        case 'archive':
            return 'Archive workflow data';
        case 'export':
            return 'Export data to external system';
        default:
            return 'Workflow output and completion';
    }
}
//# sourceMappingURL=OutputNode.js.map