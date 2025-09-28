import React from 'react';
import { Handle, Position } from 'reactflow';
import { Card, CardContent, Badge } from '@urnlabs/ui';
import { Zap, Clock, Mail, Database, Webhook, Calendar } from 'lucide-react';
const triggerIcons = {
    manual: Zap,
    schedule: Clock,
    webhook: Webhook,
    email: Mail,
    database: Database,
    event: Calendar,
};
const triggerColors = {
    manual: 'bg-green-100 text-green-800 border-green-200',
    schedule: 'bg-blue-100 text-blue-800 border-blue-200',
    webhook: 'bg-purple-100 text-purple-800 border-purple-200',
    email: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    database: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    event: 'bg-pink-100 text-pink-800 border-pink-200',
};
export const TriggerNode = ({ data, selected }) => {
    const Icon = triggerIcons[data.triggerType] || Zap;
    return (<Card className={`min-w-[200px] ${selected ? 'ring-2 ring-primary' : ''}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-md bg-green-100 flex items-center justify-center">
            <Icon className="h-4 w-4 text-green-600"/>
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">{data.label}</div>
            <Badge variant="outline" className={triggerColors[data.triggerType]}>
              {data.triggerType}
            </Badge>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mb-2">
          {getTriggerDescription(data.triggerType)}
        </div>

        {data.config && (<div className="text-xs bg-muted p-2 rounded">
            {Object.entries(data.config).map(([key, value]) => (<div key={key} className="flex justify-between">
                <span className="capitalize">{key}:</span>
                <span className="font-medium">{String(value)}</span>
              </div>))}
          </div>)}
      </CardContent>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-green-500"/>
    </Card>);
};
function getTriggerDescription(type) {
    switch (type) {
        case 'manual':
            return 'Manually triggered workflow start';
        case 'schedule':
            return 'Time-based trigger with cron scheduling';
        case 'webhook':
            return 'HTTP webhook endpoint trigger';
        case 'email':
            return 'Email-based trigger activation';
        case 'database':
            return 'Database change trigger';
        case 'event':
            return 'Event-driven trigger activation';
        default:
            return 'Workflow trigger point';
    }
}
//# sourceMappingURL=TriggerNode.js.map