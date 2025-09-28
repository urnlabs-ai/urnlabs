import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@urnlabs/ui';
import { ArrowLeft, Home, Search, HelpCircle, Zap } from 'lucide-react';
export const NotFoundPage = () => {
    const navigate = useNavigate();
    const quickLinks = [
        {
            title: 'Dashboard',
            description: 'Go to your main dashboard',
            href: '/dashboard',
            icon: Home,
        },
        {
            title: 'AI Agents',
            description: 'Manage your AI agents',
            href: '/agents',
            icon: Zap,
        },
        {
            title: 'Workflows',
            description: 'View your workflows',
            href: '/workflows',
            icon: Search,
        },
        {
            title: 'Help Center',
            description: 'Get help and support',
            href: '/help',
            icon: HelpCircle,
        },
    ];
    return (<div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-8 max-w-md mx-auto">
        {/* 404 Illustration */}
        <div className="space-y-4">
          <div className="text-8xl font-bold text-muted-foreground/20">404</div>
          <h1 className="text-3xl font-bold">Page not found</h1>
          <p className="text-muted-foreground text-lg">
            Sorry, we couldn't find the page you're looking for.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4">
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate(-1)} variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4"/>
              Go back
            </Button>
            <Button onClick={() => navigate('/dashboard')} className="gap-2">
              <Home className="h-4 w-4"/>
              Home
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            Or try one of these popular pages:
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid gap-3 text-left">
          {quickLinks.map((link) => (<Link key={link.href} to={link.href} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                <link.icon className="h-4 w-4 text-primary"/>
              </div>
              <div>
                <div className="font-medium text-sm">{link.title}</div>
                <div className="text-xs text-muted-foreground">{link.description}</div>
              </div>
            </Link>))}
        </div>

        {/* Help Text */}
        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            Still having trouble? {' '}
            <Link to="/help" className="text-primary hover:underline">
              Contact our support team
            </Link>
          </p>
        </div>
      </div>
    </div>);
};
//# sourceMappingURL=not-found.js.map