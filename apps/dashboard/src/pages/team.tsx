import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Badge, Avatar, AvatarFallback, AvatarImage } from '@urnlabs/ui'
import { Plus, Users, Mail, MoreHorizontal, Shield, UserCheck, UserX, Crown, Settings } from 'lucide-react'

export const TeamPage: React.FC = () => {
  const teamMembers = [
    {
      id: 1,
      name: 'Sarah Johnson',
      email: 'sarah@urnlabs.ai',
      role: 'Administrator',
      status: 'active',
      avatar: undefined,
      initials: 'SJ',
      joinDate: '2023-01-15',
      lastActive: '2 minutes ago',
      permissions: ['admin', 'read', 'write', 'delete'],
      department: 'Engineering',
    },
    {
      id: 2,
      name: 'Mike Chen',
      email: 'mike@urnlabs.ai',
      role: 'Manager',
      status: 'active',
      avatar: undefined,
      initials: 'MC',
      joinDate: '2023-02-20',
      lastActive: '15 minutes ago',
      permissions: ['read', 'write', 'manage'],
      department: 'Product',
    },
    {
      id: 3,
      name: 'Alex Rivera',
      email: 'alex@urnlabs.ai',
      role: 'Developer',
      status: 'active',
      avatar: undefined,
      initials: 'AR',
      joinDate: '2023-03-10',
      lastActive: '1 hour ago',
      permissions: ['read', 'write'],
      department: 'Engineering',
    },
    {
      id: 4,
      name: 'Emily Davis',
      email: 'emily@urnlabs.ai',
      role: 'Analyst',
      status: 'inactive',
      avatar: undefined,
      initials: 'ED',
      joinDate: '2023-04-05',
      lastActive: '2 days ago',
      permissions: ['read'],
      department: 'Analytics',
    },
    {
      id: 5,
      name: 'David Wilson',
      email: 'david@urnlabs.ai',
      role: 'Viewer',
      status: 'pending',
      avatar: undefined,
      initials: 'DW',
      joinDate: '2024-01-10',
      lastActive: 'Never',
      permissions: ['read'],
      department: 'Sales',
    },
  ]

  const roles = [
    {
      name: 'Administrator',
      description: 'Full access to all features and settings',
      count: 1,
      permissions: ['admin', 'read', 'write', 'delete', 'manage'],
      color: 'bg-red-100 text-red-800 border-red-200',
    },
    {
      name: 'Manager',
      description: 'Can manage users and workflows',
      count: 1,
      permissions: ['read', 'write', 'manage'],
      color: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    {
      name: 'Developer',
      description: 'Can create and modify workflows',
      count: 1,
      permissions: ['read', 'write'],
      color: 'bg-green-100 text-green-800 border-green-200',
    },
    {
      name: 'Analyst',
      description: 'Can view analytics and reports',
      count: 1,
      permissions: ['read', 'analytics'],
      color: 'bg-purple-100 text-purple-800 border-purple-200',
    },
    {
      name: 'Viewer',
      description: 'Read-only access to dashboards',
      count: 1,
      permissions: ['read'],
      color: 'bg-gray-100 text-gray-800 border-gray-200',
    },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'inactive':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'pending':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'suspended':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <UserCheck className="h-3 w-3" />
      case 'inactive':
        return <UserX className="h-3 w-3" />
      case 'pending':
        return <Shield className="h-3 w-3" />
      case 'suspended':
        return <UserX className="h-3 w-3" />
      default:
        return null
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'Administrator':
        return <Crown className="h-4 w-4" />
      case 'Manager':
        return <Users className="h-4 w-4" />
      default:
        return <Users className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground">
            Manage team members, roles, and permissions for your organization.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Settings className="h-4 w-4" />
            Manage Roles
          </Button>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Invite Member
          </Button>
        </div>
      </div>

      {/* Team Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamMembers.length}</div>
            <p className="text-xs text-muted-foreground">+2 from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Members</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {teamMembers.filter(m => m.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">
              {Math.round((teamMembers.filter(m => m.status === 'active').length / teamMembers.length) * 100)}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Invites</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {teamMembers.filter(m => m.status === 'pending').length}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting acceptance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Departments</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(teamMembers.map(m => m.department)).size}
            </div>
            <p className="text-xs text-muted-foreground">Across organization</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Team Members List */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage individual team members and their access levels.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.avatar} alt={member.name} />
                        <AvatarFallback>{member.initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{member.name}</h4>
                          <Badge variant="outline" className={getStatusColor(member.status)}>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(member.status)}
                              {member.status}
                            </div>
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span>{member.role}</span>
                          <span>•</span>
                          <span>{member.department}</span>
                          <span>•</span>
                          <span>Last active: {member.lastActive}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.role === 'Administrator' && (
                        <Crown className="h-4 w-4 text-yellow-500" />
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Roles & Permissions */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Roles & Permissions</CardTitle>
              <CardDescription>
                Overview of available roles and their capabilities.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {roles.map((role) => (
                  <div key={role.name} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(role.name)}
                        <h4 className="font-medium text-sm">{role.name}</h4>
                      </div>
                      <Badge variant="outline" className={role.color}>
                        {role.count}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {role.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.slice(0, 3).map((permission) => (
                        <Badge
                          key={permission}
                          variant="secondary"
                          className="text-xs"
                        >
                          {permission}
                        </Badge>
                      ))}
                      {role.permissions.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{role.permissions.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common team management tasks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Plus className="h-4 w-4" />
                Invite Team Member
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2">
                <Settings className="h-4 w-4" />
                Configure Permissions
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2">
                <Users className="h-4 w-4" />
                Bulk Import Users
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2">
                <Shield className="h-4 w-4" />
                Security Audit
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}