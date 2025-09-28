import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Checkbox } from '@urnlabs/ui';
import { Eye, EyeOff, Loader2, Mail, Lock, User, Building, Zap, Check } from 'lucide-react';
export const SignupPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = React.useState({
        firstName: '',
        lastName: '',
        email: '',
        company: '',
        password: '',
        confirmPassword: '',
        agreeToTerms: false,
        subscribeToUpdates: true,
    });
    const [showPassword, setShowPassword] = React.useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [errors, setErrors] = React.useState({});
    const passwordRequirements = [
        { text: 'At least 8 characters', met: formData.password.length >= 8 },
        { text: 'Contains uppercase letter', met: /[A-Z]/.test(formData.password) },
        { text: 'Contains lowercase letter', met: /[a-z]/.test(formData.password) },
        { text: 'Contains number', met: /\d/.test(formData.password) },
        { text: 'Contains special character', met: /[!@#$%^&*]/.test(formData.password) },
    ];
    const validateForm = () => {
        const newErrors = {};
        if (!formData.firstName.trim()) {
            newErrors.firstName = 'First name is required';
        }
        if (!formData.lastName.trim()) {
            newErrors.lastName = 'Last name is required';
        }
        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        }
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Please enter a valid email address';
        }
        if (!formData.company.trim()) {
            newErrors.company = 'Company name is required';
        }
        if (!formData.password) {
            newErrors.password = 'Password is required';
        }
        else if (!passwordRequirements.every(req => req.met)) {
            newErrors.password = 'Password does not meet all requirements';
        }
        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match';
        }
        if (!formData.agreeToTerms) {
            newErrors.agreeToTerms = 'You must agree to the terms and conditions';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) {
            return;
        }
        setIsLoading(true);
        try {
            // Mock signup - replace with actual API call
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Simulate successful signup
            console.log('Signup data:', formData);
            // Redirect to login with success message
            navigate('/login', {
                state: {
                    message: 'Account created successfully! Please sign in with your credentials.',
                }
            });
        }
        catch (err) {
            setErrors({ general: 'Signup failed. Please try again.' });
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear field-specific error when user starts typing
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
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
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-muted-foreground">
            Get started with URN Labs AI Agent platform
          </p>
        </div>

        {/* Signup Form */}
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Sign up</CardTitle>
            <CardDescription>
              Create your account to start building AI agents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {errors.general && (<div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {errors.general}
                </div>)}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="firstName" className="text-sm font-medium">
                    First name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                    <Input id="firstName" placeholder="John" value={formData.firstName} onChange={(e) => handleInputChange('firstName', e.target.value)} className="pl-10" disabled={isLoading}/>
                  </div>
                  {errors.firstName && (<p className="text-xs text-red-600">{errors.firstName}</p>)}
                </div>

                <div className="space-y-2">
                  <label htmlFor="lastName" className="text-sm font-medium">
                    Last name
                  </label>
                  <Input id="lastName" placeholder="Doe" value={formData.lastName} onChange={(e) => handleInputChange('lastName', e.target.value)} disabled={isLoading}/>
                  {errors.lastName && (<p className="text-xs text-red-600">{errors.lastName}</p>)}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                  <Input id="email" type="email" placeholder="john@company.com" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} className="pl-10" disabled={isLoading}/>
                </div>
                {errors.email && (<p className="text-xs text-red-600">{errors.email}</p>)}
              </div>

              <div className="space-y-2">
                <label htmlFor="company" className="text-sm font-medium">
                  Company name
                </label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                  <Input id="company" placeholder="Acme Corp" value={formData.company} onChange={(e) => handleInputChange('company', e.target.value)} className="pl-10" disabled={isLoading}/>
                </div>
                {errors.company && (<p className="text-xs text-red-600">{errors.company}</p>)}
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                  <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Create a strong password" value={formData.password} onChange={(e) => handleInputChange('password', e.target.value)} className="pl-10 pr-10" disabled={isLoading}/>
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" disabled={isLoading}>
                    {showPassword ? (<EyeOff className="h-4 w-4"/>) : (<Eye className="h-4 w-4"/>)}
                  </button>
                </div>
                {errors.password && (<p className="text-xs text-red-600">{errors.password}</p>)}
              </div>

              {/* Password Requirements */}
              {formData.password && (<div className="space-y-2">
                  <p className="text-xs font-medium">Password requirements:</p>
                  <div className="space-y-1">
                    {passwordRequirements.map((req, index) => (<div key={index} className="flex items-center gap-2 text-xs">
                        <Check className={`h-3 w-3 ${req.met ? 'text-green-600' : 'text-muted-foreground'}`}/>
                        <span className={req.met ? 'text-green-600' : 'text-muted-foreground'}>
                          {req.text}
                        </span>
                      </div>))}
                  </div>
                </div>)}

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                  <Input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm your password" value={formData.confirmPassword} onChange={(e) => handleInputChange('confirmPassword', e.target.value)} className="pl-10 pr-10" disabled={isLoading}/>
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" disabled={isLoading}>
                    {showConfirmPassword ? (<EyeOff className="h-4 w-4"/>) : (<Eye className="h-4 w-4"/>)}
                  </button>
                </div>
                {errors.confirmPassword && (<p className="text-xs text-red-600">{errors.confirmPassword}</p>)}
              </div>

              <div className="space-y-3">
                <div className="flex items-start space-x-2">
                  <Checkbox id="agreeToTerms" checked={formData.agreeToTerms} onCheckedChange={(checked) => handleInputChange('agreeToTerms', checked)} disabled={isLoading} className="mt-0.5"/>
                  <div className="text-sm leading-relaxed">
                    <label htmlFor="agreeToTerms" className="cursor-pointer">
                      I agree to the{' '}
                      <Link to="/terms" className="text-primary hover:underline">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link to="/privacy" className="text-primary hover:underline">
                        Privacy Policy
                      </Link>
                    </label>
                  </div>
                </div>
                {errors.agreeToTerms && (<p className="text-xs text-red-600">{errors.agreeToTerms}</p>)}

                <div className="flex items-start space-x-2">
                  <Checkbox id="subscribeToUpdates" checked={formData.subscribeToUpdates} onCheckedChange={(checked) => handleInputChange('subscribeToUpdates', checked)} disabled={isLoading} className="mt-0.5"/>
                  <label htmlFor="subscribeToUpdates" className="text-sm cursor-pointer">
                    Subscribe to product updates and news
                  </label>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (<>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                    Creating account...
                  </>) : ('Create account')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Sign in link */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>);
};
//# sourceMappingURL=signup.js.map