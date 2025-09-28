import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DashboardLayout, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarNav, SidebarNavItem, SidebarNavGroup, SidebarToggle, Header, HeaderLeft, HeaderCenter, HeaderRight, HeaderLogo, HeaderSearch, HeaderNotifications, HeaderUserMenu, HeaderBreadcrumbs, Button, Avatar, AvatarFallback, AvatarImage, } from '@urnlabs/ui';
import { LayoutDashboard, Bot, Workflow, BarChart3, Settings, Users, Database, Shield, Zap, HelpCircle, LogOut, User, Search, Plus, } from 'lucide-react';
const DashboardLayoutComponent = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
    // Mock user data - replace with actual user context
    const user = {
        name: 'John Doe',
        email: 'john@urnlabs.ai',
        avatar: undefined,
        initials: 'JD',
    };
    // Navigation items
    const navigationItems = [
        {
            icon: <LayoutDashboard className="h-4 w-4"/>,
            label: 'Overview',
            href: '/dashboard',
            active: location.pathname === '/dashboard',
        },
        {
            icon: <Bot className="h-4 w-4"/>,
            label: 'AI Agents',
            href: '/agents',
            active: location.pathname.startsWith('/agents'),
            badge: '12',
        },
        {
            icon: <Workflow className="h-4 w-4"/>,
            label: 'Workflows',
            href: '/workflows',
            active: location.pathname.startsWith('/workflows'),
            badge: '5',
        },
        {
            icon: <BarChart3 className="h-4 w-4"/>,
            label: 'Analytics',
            href: '/analytics',
            active: location.pathname.startsWith('/analytics'),
        },
        {
            icon: <Users className="h-4 w-4"/>,
            label: 'Team',
            href: '/team',
            active: location.pathname.startsWith('/team'),
        },
        {
            icon: <Database className="h-4 w-4"/>,
            label: 'Data Sources',
            href: '/data-sources',
            active: location.pathname.startsWith('/data-sources'),
        },
    ];
    const systemItems = [
        {
            icon: <Settings className="h-4 w-4"/>,
            label: 'Settings',
            href: '/settings',
            active: location.pathname.startsWith('/settings'),
        },
        {
            icon: <Shield className="h-4 w-4"/>,
            label: 'Security',
            href: '/security',
            active: location.pathname.startsWith('/security'),
        },
        {
            icon: <HelpCircle className="h-4 w-4"/>,
            label: 'Help & Support',
            href: '/help',
            active: location.pathname.startsWith('/help'),
        },
    ];
    // Breadcrumb generation
    const generateBreadcrumbs = () => {
        const pathSegments = location.pathname.split('/').filter(Boolean);
        const breadcrumbs = [
            { label: 'Dashboard', href: '/dashboard', active: false },
        ];
        if (pathSegments.length > 1) {
            pathSegments.slice(1).forEach((segment, index) => {
                const isLast = index === pathSegments.length - 2;
                const href = `/${pathSegments.slice(0, index + 2).join('/')}`;
                breadcrumbs.push({
                    label: segment.charAt(0).toUpperCase() + segment.slice(1).replace('-', ' '),
                    href: isLast ? undefined : href,
                    active: isLast,
                });
            });
        }
        else if (pathSegments[0] !== 'dashboard') {
            breadcrumbs.push({
                label: pathSegments[0].charAt(0).toUpperCase() + pathSegments[0].slice(1).replace('-', ' '),
                href: undefined,
                active: true,
            });
        }
        return breadcrumbs;
    };
    const handleNavigation = (href) => {
        navigate(href);
    };
    const handleSearch = (query) => {
        console.log('Search query:', query);
        // Implement search functionality
    };
    const handleSignOut = () => {
        console.log('Sign out');
        // Implement sign out functionality
    };
    const menuItems = [
        { label: 'Profile', icon: <User className="h-4 w-4"/>, onClick: () => navigate('/profile') },
        { label: 'Settings', icon: <Settings className="h-4 w-4"/>, onClick: () => navigate('/settings') },
        { separator: true },
        { label: 'Sign Out', icon: <LogOut className="h-4 w-4"/>, onClick: handleSignOut },
    ];
    const sidebar = (<Sidebar defaultCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} className="border-r">
      <SidebarHeader>
        <HeaderLogo collapsed={sidebarCollapsed} href="/dashboard">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary-foreground"/>
            </div>
            {!sidebarCollapsed && (<span className="text-lg font-semibold">URN Labs</span>)}
          </div>
        </HeaderLogo>
      </SidebarHeader>

      <SidebarContent>
        <SidebarNav>
          <SidebarNavGroup>
            {navigationItems.map((item) => (<SidebarNavItem key={item.href} icon={item.icon} active={item.active} badge={item.badge} onClick={() => handleNavigation(item.href)}>
                {item.label}
              </SidebarNavItem>))}
          </SidebarNavGroup>

          <SidebarNavGroup title="System">
            {systemItems.map((item) => (<SidebarNavItem key={item.href} icon={item.icon} active={item.active} onClick={() => handleNavigation(item.href)}>
                {item.label}
              </SidebarNavItem>))}
          </SidebarNavGroup>
        </SidebarNav>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatar} alt={user.name}/>
            <AvatarFallback>{user.initials}</AvatarFallback>
          </Avatar>
          {!sidebarCollapsed && (<div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
            </div>)}
          <SidebarToggle />
        </div>
      </SidebarFooter>
    </Sidebar>);
    const header = (<Header>
      <HeaderLeft>
        <SidebarToggle className="md:hidden"/>
      </HeaderLeft>

      <HeaderCenter>
        <HeaderSearch placeholder="Search agents, workflows, data..." onSubmit={handleSearch} className="w-96"/>
      </HeaderCenter>

      <HeaderRight>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4"/>
          <span className="hidden sm:inline">Create</span>
        </Button>
        <HeaderNotifications count={3}/>
        <HeaderUserMenu user={user} menuItems={menuItems} onSignOut={handleSignOut}/>
      </HeaderRight>
    </Header>);
    const breadcrumbs = (<HeaderBreadcrumbs items={generateBreadcrumbs()}/>);
    const actions = (<div className="flex items-center gap-2">
      <Button variant="outline" size="sm">
        <Search className="h-4 w-4 mr-2"/>
        Search
      </Button>
      <Button size="sm">
        <Plus className="h-4 w-4 mr-2"/>
        New
      </Button>
    </div>);
    return (<DashboardLayout sidebar={sidebar} header={header} breadcrumbs={breadcrumbs} actions={actions}>
      <Outlet />
    </DashboardLayout>);
};
export default DashboardLayoutComponent;
//# sourceMappingURL=dashboard-layout.js.map