import React from 'react';
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, Button } from '@urnlabs/ui';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
const Navigation = () => {
    const [isOpen, setIsOpen] = React.useState(false);
    const ListItem = React.forwardRef(({ className, title, children, ...props }, ref) => {
        return (<li>
        <NavigationMenuLink asChild>
          <a ref={ref} className={cn("block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground", className)} {...props}>
            <div className="text-sm font-medium leading-none">{title}</div>
            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
              {children}
            </p>
          </a>
        </NavigationMenuLink>
      </li>);
    });
    ListItem.displayName = "ListItem";
    return (<header className="sticky top-0 z-50 w-full border-b border-slate-800/50 bg-slate-900/90 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <a href="/" className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-gradient-to-r from-blue-500 to-green-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">U</span>
              </div>
              <span className="font-bold text-xl text-white">Urnlabs</span>
            </a>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent text-slate-300 hover:text-white">
                    Platform
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-[.75fr_1fr]">
                      <li className="row-span-3">
                        <NavigationMenuLink asChild>
                          <a className="flex h-full w-full select-none flex-col justify-end rounded-md bg-gradient-to-b from-blue-500/20 to-green-500/20 p-6 no-underline outline-none focus:shadow-md" href="/platform">
                            <div className="mb-2 mt-4 text-lg font-medium text-white">
                              AI Agent Platform
                            </div>
                            <p className="text-sm leading-tight text-slate-300">
                              Build deterministic workflows with governance-first approach
                            </p>
                          </a>
                        </NavigationMenuLink>
                      </li>
                      <ListItem href="/platform/workflows" title="Workflows">
                        Create and manage AI agent workflows
                      </ListItem>
                      <ListItem href="/platform/governance" title="Governance">
                        Built-in security and compliance features
                      </ListItem>
                      <ListItem href="/platform/analytics" title="Analytics">
                        Track ROI and performance metrics
                      </ListItem>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent text-slate-300 hover:text-white">
                    Solutions
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                      <ListItem href="/solutions/enterprise" title="Enterprise">
                        Large-scale AI automation for enterprises
                      </ListItem>
                      <ListItem href="/solutions/startups" title="Startups">
                        Rapid automation for growing teams
                      </ListItem>
                      <ListItem href="/solutions/developers" title="Developers">
                        API-first platform for technical teams
                      </ListItem>
                      <ListItem href="/solutions/consulting" title="Consulting">
                        Expert guidance for AI implementation
                      </ListItem>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink href="/pricing" className={cn(navigationMenuTriggerStyle(), "bg-transparent text-slate-300 hover:text-white")}>
                    Pricing
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent text-slate-300 hover:text-white">
                    Resources
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                      <ListItem href="/blog" title="Blog">
                        Latest insights on AI automation
                      </ListItem>
                      <ListItem href="/case-studies" title="Case Studies">
                        Success stories from our customers
                      </ListItem>
                      <ListItem href="/docs" title="Documentation">
                        Technical guides and API reference
                      </ListItem>
                      <ListItem href="/community" title="Community">
                        Join our developer community
                      </ListItem>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center space-x-4">
            <ThemeToggle />
            <a href="/contact" className="text-slate-300 hover:text-white transition-colors text-sm font-medium">
              Contact
            </a>
            <Button asChild className="bg-blue-500 hover:bg-blue-600">
              <a href="/contact">
                Book Demo
              </a>
            </Button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="inline-flex items-center justify-center p-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
              {isOpen ? <X className="h-6 w-6"/> : <Menu className="h-6 w-6"/>}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (<div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 bg-slate-900 border-t border-slate-800">
              <MobileNavItem href="/platform">Platform</MobileNavItem>
              <MobileNavItem href="/solutions">Solutions</MobileNavItem>
              <MobileNavItem href="/pricing">Pricing</MobileNavItem>
              <MobileNavItem href="/blog">Blog</MobileNavItem>
              <MobileNavItem href="/case-studies">Case Studies</MobileNavItem>
              <MobileNavItem href="/contact">Contact</MobileNavItem>
              <div className="pt-4">
                <Button asChild className="w-full bg-blue-500 hover:bg-blue-600">
                  <a href="/contact">
                    Book Demo
                  </a>
                </Button>
              </div>
            </div>
          </div>)}
      </div>
    </header>);
};
const MobileNavItem = ({ href, children }) => {
    return (<a href={href} className="block px-3 py-2 rounded-md text-base font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
      {children}
    </a>);
};
export default Navigation;
//# sourceMappingURL=Navigation.js.map