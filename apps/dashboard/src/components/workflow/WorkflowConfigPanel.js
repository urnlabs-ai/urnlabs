import React, { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, Card, CardContent, CardHeader, CardTitle, Badge, Separator } from '@urnlabs/ui';
import { Settings, Save, Trash2, Copy } from 'lucide-react';
export const WorkflowConfigPanel = ({ isOpen, onClose, selectedNode, onUpdateNode, onDeleteNode, onDuplicateNode }) => {
    const [nodeData, setNodeData] = useState(selectedNode?.data || {});
    React.useEffect(() => {
        setNodeData(selectedNode?.data || {});
    }, [selectedNode]);
    const handleSave = () => {
        if (selectedNode) {
            onUpdateNode(selectedNode.id, nodeData);
            onClose();
        }
    };
    const handleDelete = () => {
        if (selectedNode) {
            onDeleteNode(selectedNode.id);
            onClose();
        }
    };
    const handleDuplicate = () => {
        if (selectedNode) {
            onDuplicateNode(selectedNode.id);
            onClose();
        }
    };
    const updateNodeData = (key, value) => {
        setNodeData((prev) => ({ ...prev, [key]: value }));
    };
    const updateConfig = (key, value) => {
        setNodeData((prev) => ({
            ...prev,
            config: { ...prev.config, [key]: value }
        }));
    };
    const renderTriggerConfig = () => (<div className="space-y-4">
      <div>
        <Label htmlFor="triggerType">Trigger Type</Label>
        <Select value={nodeData.triggerType || 'manual'} onValueChange={(value) => updateNodeData('triggerType', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="schedule">Schedule</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="database">Database</SelectItem>
            <SelectItem value="event">Event</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {nodeData.triggerType === 'schedule' && (<div>
          <Label htmlFor="cronExpression">Cron Expression</Label>
          <Input id="cronExpression" placeholder="0 0 * * *" value={nodeData.config?.cronExpression || ''} onChange={(e) => updateConfig('cronExpression', e.target.value)}/>
          <p className="text-xs text-muted-foreground mt-1">
            e.g., "0 0 * * *" for daily at midnight
          </p>
        </div>)}

      {nodeData.triggerType === 'webhook' && (<div>
          <Label htmlFor="webhookUrl">Webhook URL</Label>
          <Input id="webhookUrl" placeholder="https://api.example.com/webhook" value={nodeData.config?.webhookUrl || ''} onChange={(e) => updateConfig('webhookUrl', e.target.value)}/>
        </div>)}

      {nodeData.triggerType === 'email' && (<div className="space-y-2">
          <div>
            <Label htmlFor="emailPattern">Email Pattern</Label>
            <Input id="emailPattern" placeholder="subject:order confirmed" value={nodeData.config?.emailPattern || ''} onChange={(e) => updateConfig('emailPattern', e.target.value)}/>
          </div>
          <div>
            <Label htmlFor="emailAddress">From Address</Label>
            <Input id="emailAddress" placeholder="orders@company.com" value={nodeData.config?.emailAddress || ''} onChange={(e) => updateConfig('emailAddress', e.target.value)}/>
          </div>
        </div>)}
    </div>);
    const renderActionConfig = () => (<div className="space-y-4">
      <div>
        <Label htmlFor="actionType">Action Type</Label>
        <Select value={nodeData.actionType || 'api-call'} onValueChange={(value) => updateNodeData('actionType', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="api-call">API Call</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="database">Database</SelectItem>
            <SelectItem value="file-operation">File Operation</SelectItem>
            <SelectItem value="notification">Notification</SelectItem>
            <SelectItem value="ai-agent">AI Agent</SelectItem>
            <SelectItem value="script">Script</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {nodeData.actionType === 'api-call' && (<div className="space-y-2">
          <div>
            <Label htmlFor="apiUrl">API URL</Label>
            <Input id="apiUrl" placeholder="https://api.example.com/endpoint" value={nodeData.config?.apiUrl || ''} onChange={(e) => updateConfig('apiUrl', e.target.value)}/>
          </div>
          <div>
            <Label htmlFor="method">HTTP Method</Label>
            <Select value={nodeData.config?.method || 'GET'} onValueChange={(value) => updateConfig('method', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="headers">Headers (JSON)</Label>
            <Textarea id="headers" placeholder='{"Authorization": "Bearer token"}' value={nodeData.config?.headers || ''} onChange={(e) => updateConfig('headers', e.target.value)} rows={3}/>
          </div>
          <div>
            <Label htmlFor="body">Request Body (JSON)</Label>
            <Textarea id="body" placeholder='{"key": "value"}' value={nodeData.config?.body || ''} onChange={(e) => updateConfig('body', e.target.value)} rows={4}/>
          </div>
        </div>)}

      {nodeData.actionType === 'ai-agent' && (<div className="space-y-2">
          <div>
            <Label htmlFor="agentType">Agent Type</Label>
            <Select value={nodeData.config?.agentType || 'claude'} onValueChange={(value) => updateConfig('agentType', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="gpt-4">GPT-4</SelectItem>
                <SelectItem value="custom">Custom Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="prompt">Prompt Template</Label>
            <Textarea id="prompt" placeholder="Analyze the following data: {{input}}" value={nodeData.config?.prompt || ''} onChange={(e) => updateConfig('prompt', e.target.value)} rows={4}/>
          </div>
          <div>
            <Label htmlFor="temperature">Temperature</Label>
            <Input id="temperature" type="number" min="0" max="2" step="0.1" placeholder="0.7" value={nodeData.config?.temperature || ''} onChange={(e) => updateConfig('temperature', parseFloat(e.target.value))}/>
          </div>
        </div>)}

      {nodeData.actionType === 'email' && (<div className="space-y-2">
          <div>
            <Label htmlFor="emailTo">To</Label>
            <Input id="emailTo" placeholder="user@example.com" value={nodeData.config?.emailTo || ''} onChange={(e) => updateConfig('emailTo', e.target.value)}/>
          </div>
          <div>
            <Label htmlFor="emailSubject">Subject</Label>
            <Input id="emailSubject" placeholder="Workflow Notification" value={nodeData.config?.emailSubject || ''} onChange={(e) => updateConfig('emailSubject', e.target.value)}/>
          </div>
          <div>
            <Label htmlFor="emailTemplate">Email Template</Label>
            <Textarea id="emailTemplate" placeholder="Hello {{name}}, your workflow has completed." value={nodeData.config?.emailTemplate || ''} onChange={(e) => updateConfig('emailTemplate', e.target.value)} rows={4}/>
          </div>
        </div>)}

      {nodeData.actionType === 'database' && (<div className="space-y-2">
          <div>
            <Label htmlFor="operation">Database Operation</Label>
            <Select value={nodeData.config?.operation || 'insert'} onValueChange={(value) => updateConfig('operation', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="insert">Insert</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="select">Select</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="table">Table Name</Label>
            <Input id="table" placeholder="users" value={nodeData.config?.table || ''} onChange={(e) => updateConfig('table', e.target.value)}/>
          </div>
          <div>
            <Label htmlFor="query">SQL Query</Label>
            <Textarea id="query" placeholder="INSERT INTO users (name, email) VALUES (?, ?)" value={nodeData.config?.query || ''} onChange={(e) => updateConfig('query', e.target.value)} rows={3}/>
          </div>
        </div>)}
    </div>);
    const renderConditionConfig = () => (<div className="space-y-4">
      <div>
        <Label htmlFor="conditionType">Condition Type</Label>
        <Select value={nodeData.conditionType || 'if-else'} onValueChange={(value) => updateNodeData('conditionType', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="if-else">If-Else</SelectItem>
            <SelectItem value="loop">Loop</SelectItem>
            <SelectItem value="filter">Filter</SelectItem>
            <SelectItem value="switch">Switch</SelectItem>
            <SelectItem value="retry">Retry</SelectItem>
            <SelectItem value="timeout">Timeout</SelectItem>
            <SelectItem value="probability">Probability</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="condition">Condition Expression</Label>
        <Input id="condition" placeholder="{{data.status}} === 'success'" value={nodeData.config?.condition || ''} onChange={(e) => updateConfig('condition', e.target.value)}/>
        <p className="text-xs text-muted-foreground mt-1">
          Use {{ variable }} syntax to reference data
        </p>
      </div>

      {nodeData.conditionType === 'loop' && (<div>
          <Label htmlFor="maxIterations">Max Iterations</Label>
          <Input id="maxIterations" type="number" placeholder="10" value={nodeData.config?.maxIterations || ''} onChange={(e) => updateConfig('maxIterations', parseInt(e.target.value))}/>
        </div>)}

      {nodeData.conditionType === 'timeout' && (<div>
          <Label htmlFor="timeoutMs">Timeout (milliseconds)</Label>
          <Input id="timeoutMs" type="number" placeholder="5000" value={nodeData.config?.timeoutMs || ''} onChange={(e) => updateConfig('timeoutMs', parseInt(e.target.value))}/>
        </div>)}

      {nodeData.conditionType === 'probability' && (<div>
          <Label htmlFor="probability">Probability (%)</Label>
          <Input id="probability" type="number" min="0" max="100" placeholder="50" value={nodeData.config?.probability || ''} onChange={(e) => updateConfig('probability', parseInt(e.target.value))}/>
        </div>)}

      {nodeData.conditionType === 'retry' && (<div className="space-y-2">
          <div>
            <Label htmlFor="maxRetries">Max Retries</Label>
            <Input id="maxRetries" type="number" placeholder="3" value={nodeData.config?.maxRetries || ''} onChange={(e) => updateConfig('maxRetries', parseInt(e.target.value))}/>
          </div>
          <div>
            <Label htmlFor="retryDelay">Retry Delay (ms)</Label>
            <Input id="retryDelay" type="number" placeholder="1000" value={nodeData.config?.retryDelay || ''} onChange={(e) => updateConfig('retryDelay', parseInt(e.target.value))}/>
          </div>
        </div>)}
    </div>);
    const renderOutputConfig = () => (<div className="space-y-4">
      <div>
        <Label htmlFor="outputType">Output Type</Label>
        <Select value={nodeData.outputType || 'success'} onValueChange={(value) => updateNodeData('outputType', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="file">File</SelectItem>
            <SelectItem value="database">Database</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="notification">Notification</SelectItem>
            <SelectItem value="archive">Archive</SelectItem>
            <SelectItem value="export">Export</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(nodeData.outputType === 'file' || nodeData.outputType === 'export') && (<div className="space-y-2">
          <div>
            <Label htmlFor="fileName">File Name</Label>
            <Input id="fileName" placeholder="workflow-output.json" value={nodeData.config?.fileName || ''} onChange={(e) => updateConfig('fileName', e.target.value)}/>
          </div>
          <div>
            <Label htmlFor="filePath">File Path</Label>
            <Input id="filePath" placeholder="/exports/" value={nodeData.config?.filePath || ''} onChange={(e) => updateConfig('filePath', e.target.value)}/>
          </div>
          <div>
            <Label htmlFor="format">Format</Label>
            <Select value={nodeData.config?.format || 'json'} onValueChange={(value) => updateConfig('format', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xml">XML</SelectItem>
                <SelectItem value="txt">Text</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>)}

      {nodeData.outputType === 'notification' && (<div className="space-y-2">
          <div>
            <Label htmlFor="notificationChannel">Channel</Label>
            <Select value={nodeData.config?.notificationChannel || 'slack'} onValueChange={(value) => updateConfig('notificationChannel', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="discord">Discord</SelectItem>
                <SelectItem value="teams">Microsoft Teams</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="message">Message Template</Label>
            <Textarea id="message" placeholder="Workflow completed successfully. Results: {{results}}" value={nodeData.config?.message || ''} onChange={(e) => updateConfig('message', e.target.value)} rows={3}/>
          </div>
        </div>)}
    </div>);
    const renderNodeConfig = () => {
        if (!selectedNode)
            return null;
        switch (selectedNode.type) {
            case 'trigger':
                return renderTriggerConfig();
            case 'action':
                return renderActionConfig();
            case 'condition':
                return renderConditionConfig();
            case 'output':
                return renderOutputConfig();
            default:
                return <p className="text-muted-foreground">No configuration available for this node type.</p>;
        }
    };
    return (<Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4"/>
            {selectedNode ? `Configure ${selectedNode.data.label}` : 'Node Configuration'}
          </SheetTitle>
          <SheetDescription>
            Configure the properties and behavior of this workflow node.
          </SheetDescription>
        </SheetHeader>

        {selectedNode && (<div className="mt-6 space-y-6">
            {/* Basic Properties */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Basic Properties</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="label">Node Label</Label>
                  <Input id="label" value={nodeData.label || ''} onChange={(e) => updateNodeData('label', e.target.value)} placeholder="Enter node label"/>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" value={nodeData.description || ''} onChange={(e) => updateNodeData('description', e.target.value)} placeholder="Describe what this node does..." rows={2}/>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {selectedNode.type}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {nodeData.status || 'pending'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Node-specific Configuration */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                {renderNodeConfig()}
              </CardContent>
            </Card>

            <Separator />

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button onClick={handleSave} className="flex-1">
                  <Save className="h-3 w-3 mr-1"/>
                  Save Changes
                </Button>
                <Button variant="outline" onClick={handleDuplicate}>
                  <Copy className="h-3 w-3"/>
                </Button>
              </div>

              <Button variant="destructive" onClick={handleDelete} className="w-full">
                <Trash2 className="h-3 w-3 mr-1"/>
                Delete Node
              </Button>
            </div>
          </div>)}
      </SheetContent>
    </Sheet>);
};
//# sourceMappingURL=WorkflowConfigPanel.js.map