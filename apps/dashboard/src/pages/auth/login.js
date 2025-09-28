import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Checkbox } from '@urnlabs/ui';
import { Eye, EyeOff, Loader2, Mail, Lock, Zap } from 'lucide-react';
import { useAuth } from '../../providers/AuthProvider';
export const LoginPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuth();
    const [formData, setFormData] = React.useState({
        email: '',
        password: '',
        rememberMe: false,
    });
    const [showPassword, setShowPassword] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    // Get the redirect path from location state
    const from = location.state?.from || '/dashboard';
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            const result = await login(formData.email, formData.password);
            if (result.success) {
                // Redirect to the intended page or dashboard
                navigate(from, { replace: true });
            }
            else {
                setError(result.error || 'Login failed. Please try again.');
            }
        }
        catch (err) {
            setError('An unexpected error occurred. Please try again.');
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear error when user starts typing
        if (error)
            setError('');
    };
    const handleDemoLogin = async () => {
        setFormData({
            email: 'admin@urnlabs.ai',
            password: 'password',
            rememberMe: false,
        });
        setIsLoading(true);
        try {
            const result = await login('admin@urnlabs.ai', 'password');
            if (result.success) {
                navigate(from, { replace: true });
            }
            else {
                setError(result.error || 'Demo login failed');
            }
        }
        catch (err) {
            setError('Demo login failed');
        }
        finally {
            setIsLoading(false);
        }
    };
    return (<div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo and Branding */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-7 w-7 text-primary-foreground"/>
            </div>
          </div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground">
            Sign in to your URN Labs account
          </p>
        </div>

        {/* Login Form */}
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (<div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {error}
                </div>)}

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                  <Input id="email" type="email" placeholder="john@urnlabs.ai" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} className="pl-10" required disabled={isLoading}/>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                  <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={formData.password} onChange={(e) => handleInputChange('password', e.target.value)} className="pl-10 pr-10" required disabled={isLoading}/>
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" disabled={isLoading}>
                    {showPassword ? (<EyeOff className="h-4 w-4"/>) : (<Eye className="h-4 w-4"/>)}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox id="rememberMe" checked={formData.rememberMe} onCheckedChange={(checked) => handleInputChange('rememberMe', checked)} disabled={isLoading}/>
                  <label htmlFor="rememberMe" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Remember me
                  </label>
                </div>
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (<>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                    Signing in...
                  </>) : ('Sign in')}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t"/>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>

              <Button type="button" variant="outline" className="w-full" onClick={handleDemoLogin} disabled={isLoading}>
                <Zap className="mr-2 h-4 w-4"/>
                Demo Login
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Sign up link */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </div>

        {/* Demo Credentials */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-medium text-sm mb-2">Demo Credentials</h3>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Email: admin@urnlabs.ai</p>
              <p>Password: password</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>);
};
//# sourceMappingURL=login.js.map