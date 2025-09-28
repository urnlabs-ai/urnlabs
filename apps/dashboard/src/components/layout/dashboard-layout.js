import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, SidebarInset, SidebarRail, Separator, Avatar, AvatarFallback, AvatarImage, Badge, } from '@urnlabs/ui';
import { LayoutDashboard, Bot, Workflow, BarChart3, Settings, Users, Database, Shield, Zap, HelpCircle, } from 'lucide-react';
const AppSidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const user = {
        name: 'John Doe',
        email: 'john@urnlabs.ai',
        avatar: undefined,
        initials: 'JD',
    };
    const navMain = [
        {
            title: 'Platform',
            items: [
                {
                    title: 'Overview',
                    url: '/dashboard',
                    icon: LayoutDashboard,
                    isActive: location.pathname === '/dashboard',
                },
                {
                    title: 'AI Agents',
                    url: '/agents',
                    icon: Bot,
                    isActive: location.pathname.startsWith('/agents'),
                    badge: '12',
                },
                {
                    title: 'Workflows',
                    url: '/workflows',
                    icon: Workflow,
                    isActive: location.pathname.startsWith('/workflows'),
                    badge: '5',
                },
                {
                    title: 'Analytics',
                    url: '/analytics',
                    icon: BarChart3,
                    isActive: location.pathname.startsWith('/analytics'),
                },
                {
                    title: 'Team',
                    url: '/team',
                    icon: Users,
                    isActive: location.pathname.startsWith('/team'),
                },
                {
                    title: 'Data Sources',
                    url: '/data-sources',
                    icon: Database,
                    isActive: location.pathname.startsWith('/data-sources'),
                },
            ],
        },
        {
            title: 'System',
            items: [
                {
                    title: 'Settings',
                    url: '/settings',
                    icon: Settings,
                    isActive: location.pathname.startsWith('/settings'),
                },
                {
                    title: 'Security',
                    url: '/security',
                    icon: Shield,
                    isActive: location.pathname.startsWith('/security'),
                },
                {
                    title: 'Help & Support',
                    url: '/help',
                    icon: HelpCircle,
                    isActive: location.pathname.startsWith('/help'),
                },
            ],
        },
    ];
    return (<Sidebar variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Zap className="size-4"/>
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">URN Labs</span>
                <span className="truncate text-xs">AI Agent Platform</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navMain.map((group) => (<SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (<SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={item.isActive}>
                      <a href={item.url} onClick={(e) => { e.preventDefault(); navigate(item.url); }}>
                        <item.icon />
                        <span>{item.title}</span>
                        {item.badge && (<Badge variant="outline" className="ml-auto h-5 w-5 shrink-0 items-center justify-center rounded-full">
                            {item.badge}
                          </Badge>)}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name}/>
                <AvatarFallback className="rounded-lg">{user.initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>);
};
export const DashboardLayout = () => {
    return (<SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1"/>
            <Separator orientation="vertical" className="mr-2 h-4"/>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>);
};
//# sourceMappingURL=dashboard-layout.js.map