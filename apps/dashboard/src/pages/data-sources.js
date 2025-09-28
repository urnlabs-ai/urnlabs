import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Badge } from '@urnlabs/ui';
import { Plus, Database, Cloud, Server, Link, MoreHorizontal, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';
export const DataSourcesPage = () => {
    const dataSources = [
        {
            id: 1,
            name: 'Customer Database',
            type: 'PostgreSQL',
            description: 'Primary customer data and transaction records',
            status: 'connected',
            lastSync: '2 minutes ago',
            recordCount: '1.2M',
            dataVolume: '45.6 GB',
            icon: Database,
            connectionString: 'postgresql://prod-db.urnlabs.ai:5432/customers',
            category: 'Database',
            tags: ['production', 'critical'],
        },
        {
            id: 2,
            name: 'Analytics Warehouse',
            type: 'BigQuery',
            description: 'Data warehouse for analytics and reporting',
            status: 'connected',
            lastSync: '15 minutes ago',
            recordCount: '5.8M',
            dataVolume: '128.3 GB',
            icon: Cloud,
            connectionString: 'bigquery://urnlabs-analytics.dataset',
            category: 'Warehouse',
            tags: ['analytics', 'warehouse'],
        },
        {
            id: 3,
            name: 'CRM System',
            type: 'Salesforce',
            description: 'Customer relationship management data',
            status: 'syncing',
            lastSync: '1 hour ago',
            recordCount: '345K',
            dataVolume: '12.1 GB',
            icon: Server,
            connectionString: 'salesforce://urnlabs.my.salesforce.com',
            category: 'CRM',
            tags: ['sales', 'crm'],
        },
        {
            id: 4,
            name: 'API Gateway Logs',
            type: 'Elasticsearch',
            description: 'API request logs and performance metrics',
            status: 'connected',
            lastSync: '5 minutes ago',
            recordCount: '12.4M',
            dataVolume: '89.7 GB',
            icon: Link,
            connectionString: 'elasticsearch://logs.urnlabs.ai:9200',
            category: 'Logs',
            tags: ['logs', 'monitoring'],
        },
        {
            id: 5,
            name: 'Marketing Automation',
            type: 'HubSpot',
            description: 'Marketing campaigns and lead tracking data',
            status: 'error',
            lastSync: '2 days ago',
            recordCount: '89K',
            dataVolume: '3.2 GB',
            icon: Server,
            connectionString: 'hubspot://api.hubapi.com',
            category: 'Marketing',
            tags: ['marketing', 'leads'],
        },
        {
            id: 6,
            name: 'Event Stream',
            type: 'Kafka',
            description: 'Real-time event streaming platform',
            status: 'connected',
            lastSync: 'Real-time',
            recordCount: '∞',
            dataVolume: '2.1 TB/day',
            icon: Database,
            connectionString: 'kafka://events.urnlabs.ai:9092',
            category: 'Streaming',
            tags: ['real-time', 'events'],
        },
    ];
    const categories = [
        { name: 'Database', count: 2, color: 'bg-blue-100 text-blue-800' },
        { name: 'Warehouse', count: 1, color: 'bg-purple-100 text-purple-800' },
        { name: 'CRM', count: 1, color: 'bg-green-100 text-green-800' },
        { name: 'Logs', count: 1, color: 'bg-yellow-100 text-yellow-800' },
        { name: 'Marketing', count: 1, color: 'bg-pink-100 text-pink-800' },
        { name: 'Streaming', count: 1, color: 'bg-indigo-100 text-indigo-800' },
    ];
    const getStatusColor = (status) => {
        switch (status) {
            case 'connected':
                return 'bg-green-100 text-green-800 border-green-200';
            case 'syncing':
                return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'error':
                return 'bg-red-100 text-red-800 border-red-200';
            case 'disconnected':
                return 'bg-gray-100 text-gray-800 border-gray-200';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };
    const getStatusIcon = (status) => {
        switch (status) {
            case 'connected':
                return <CheckCircle className="h-3 w-3"/>;
            case 'syncing':
                return <RefreshCw className="h-3 w-3 animate-spin"/>;
            case 'error':
                return <AlertCircle className="h-3 w-3"/>;
            case 'disconnected':
                return <Clock className="h-3 w-3"/>;
            default:
                return null;
        }
    };
    const totalRecords = dataSources.reduce((acc, ds) => {
        if (ds.recordCount === '∞')
            return acc;
        const num = parseFloat(ds.recordCount.replace(/[KM]/g, ''));
        const multiplier = ds.recordCount.includes('M') ? 1000000 : ds.recordCount.includes('K') ? 1000 : 1;
        return acc + (num * multiplier);
    }, 0);
    const formatNumber = (num) => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    };
    return (<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data Sources</h1>
          <p className="text-muted-foreground">
            Connect and manage your data sources for AI agent processing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4"/>
            Sync All
          </Button>
          <Button className="gap-2">
            <Plus className="h-4 w-4"/>
            Add Data Source
          </Button>
        </div>
      </div>

      {/* Data Source Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sources</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground"/>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dataSources.length}</div>
            <p className="text-xs text-muted-foreground">+2 from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connected</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground"/>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dataSources.filter(ds => ds.status === 'connected').length}
            </div>
            <p className="text-xs text-muted-foreground">
              {Math.round((dataSources.filter(ds => ds.status === 'connected').length / dataSources.length) * 100)}% healthy
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground"/>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalRecords)}+</div>
            <p className="text-xs text-muted-foreground">Across all sources</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground"/>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
            <p className="text-xs text-muted-foreground">Different types</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Data Sources List */}
        <div className="lg:col-span-3 space-y-4">
          {dataSources.map((source) => (<Card key={source.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <source.icon className="h-5 w-5 text-primary"/>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{source.name}</CardTitle>
                        <Badge variant="outline" className={getStatusColor(source.status)}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(source.status)}
                            {source.status}
                          </div>
                        </Badge>
                      </div>
                      <CardDescription className="mt-1">{source.description}</CardDescription>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span>Type: {source.type}</span>
                        <span>•</span>
                        <span>Records: {source.recordCount}</span>
                        <span>•</span>
                        <span>Size: {source.dataVolume}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4"/>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="grid gap-4 md:grid-cols-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Last Sync</span>
                    <div className="font-medium">{source.lastSync}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Category</span>
                    <div className="font-medium">{source.category}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Connection</span>
                    <div className="font-mono text-xs truncate">{source.connectionString}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <div className="flex gap-1">
                    {source.tags.map((tag) => (<Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>))}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <RefreshCw className="h-3 w-3 mr-1"/>
                      Sync
                    </Button>
                    <Button variant="outline" size="sm">
                      Test Connection
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>))}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
              <CardDescription>
                Data sources by category
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categories.map((category) => (<div key={category.name} className="flex items-center justify-between">
                    <span className="text-sm">{category.name}</span>
                    <Badge variant="outline" className={category.color}>
                      {category.count}
                    </Badge>
                  </div>))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common data management tasks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Plus className="h-4 w-4"/>
                Add Source
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2">
                <RefreshCw className="h-4 w-4"/>
                Sync All
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2">
                <Database className="h-4 w-4"/>
                Data Quality Check
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2">
                <Link className="h-4 w-4"/>
                Test Connections
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sync Status</CardTitle>
              <CardDescription>
                Recent synchronization activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>Customer Database</span>
                  <CheckCircle className="h-4 w-4 text-green-500"/>
                </div>
                <div className="flex items-center justify-between">
                  <span>Analytics Warehouse</span>
                  <CheckCircle className="h-4 w-4 text-green-500"/>
                </div>
                <div className="flex items-center justify-between">
                  <span>CRM System</span>
                  <RefreshCw className="h-4 w-4 text-blue-500 animate-spin"/>
                </div>
                <div className="flex items-center justify-between">
                  <span>Marketing Automation</span>
                  <AlertCircle className="h-4 w-4 text-red-500"/>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>);
};
//# sourceMappingURL=data-sources.js.map