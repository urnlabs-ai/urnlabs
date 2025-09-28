import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface FormData {
  name: string;
  email: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

interface FormStatus {
  type: 'idle' | 'submitting' | 'success' | 'error';
  message?: string;
}

export function ContactForm() {
  const [formData, setFormData] = React.useState<FormData>({
    name: '',
    email: '',
    message: ''
  });

  const [errors, setErrors] = React.useState<FormErrors>({});
  const [status, setStatus] = React.useState<FormStatus>({ type: 'idle' });
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  // Real-time validation functions
  const validateName = (name: string): string | undefined => {
    if (!name.trim()) return 'Name is required';
    if (name.trim().length < 2) return 'Name must be at least 2 characters';
    if (name.trim().length > 50) return 'Name must be less than 50 characters';
    return undefined;
  };

  const validateEmail = (email: string): string | undefined => {
    if (!email.trim()) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return undefined;
  };

  const validateMessage = (message: string): string | undefined => {
    if (!message.trim()) return 'Message is required';
    if (message.trim().length < 10) return 'Message must be at least 10 characters';
    if (message.trim().length > 1000) return 'Message must be less than 1000 characters';
    return undefined;
  };

  // Handle input changes with real-time validation
  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Real-time validation
    if (touched[field]) {
      let error: string | undefined;
      switch (field) {
        case 'name':
          error = validateName(value);
          break;
        case 'email':
          error = validateEmail(value);
          break;
        case 'message':
          error = validateMessage(value);
          break;
      }
      setErrors(prev => ({ ...prev, [field]: error }));
    }
  };

  // Handle field blur
  const handleBlur = (field: keyof FormData) => {
    setTouched(prev => ({ ...prev, [field]: true }));

    let error: string | undefined;
    switch (field) {
      case 'name':
        error = validateName(formData[field]);
        break;
      case 'email':
        error = validateEmail(formData[field]);
        break;
      case 'message':
        error = validateMessage(formData[field]);
        break;
    }
    setErrors(prev => ({ ...prev, [field]: error }));
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const nameError = validateName(formData.name);
    const emailError = validateEmail(formData.email);
    const messageError = validateMessage(formData.message);

    const newErrors: FormErrors = {
      name: nameError,
      email: emailError,
      message: messageError
    };

    setErrors(newErrors);
    setTouched({ name: true, email: true, message: true });

    // Check if there are any errors
    if (nameError || emailError || messageError) {
      setStatus({ type: 'error', message: 'Please fix the errors above' });
      return;
    }

    setStatus({ type: 'submitting' });

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      // For demo purposes, just show success
      setStatus({
        type: 'success',
        message: 'Message sent successfully! I\'ll get back to you soon.'
      });

      // Reset form after success
      setTimeout(() => {
        setFormData({ name: '', email: '', message: '' });
        setErrors({});
        setTouched({});
        setStatus({ type: 'idle' });
      }, 3000);

    } catch (error) {
      setStatus({
        type: 'error',
        message: 'Failed to send message. Please try again later.'
      });
    }
  };

  const isFormValid = !errors.name && !errors.email && !errors.message &&
                     formData.name && formData.email && formData.message;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Status Message */}
        {status.message && (
          <div className={`p-4 rounded-lg border transition-all duration-300 ${
            status.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
              : status.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
              : 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300'
          }`}>
            {status.message}
          </div>
        )}

        <div className="grid w-full items-center gap-6">
          {/* Name Field */}
          <div className="flex flex-col space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Your full name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              onBlur={() => handleBlur('name')}
              className={`transition-all duration-200 ${
                errors.name && touched.name
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                  : touched.name && !errors.name
                  ? 'border-green-500 focus:border-green-500 focus:ring-green-500/20'
                  : 'focus:ring-blue-500/20'
              }`}
              disabled={status.type === 'submitting'}
            />
            {errors.name && touched.name && (
              <p className="text-sm text-red-600 dark:text-red-400 animate-in slide-in-from-top-1 duration-200">
                {errors.name}
              </p>
            )}
          </div>

          {/* Email Field */}
          <div className="flex flex-col space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="your.email@example.com"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              onBlur={() => handleBlur('email')}
              className={`transition-all duration-200 ${
                errors.email && touched.email
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                  : touched.email && !errors.email
                  ? 'border-green-500 focus:border-green-500 focus:ring-green-500/20'
                  : 'focus:ring-blue-500/20'
              }`}
              disabled={status.type === 'submitting'}
            />
            {errors.email && touched.email && (
              <p className="text-sm text-red-600 dark:text-red-400 animate-in slide-in-from-top-1 duration-200">
                {errors.email}
              </p>
            )}
          </div>

          {/* Message Field */}
          <div className="flex flex-col space-y-2">
            <Label htmlFor="message" className="text-sm font-medium">
              Message <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="message"
              placeholder="Tell me about your project, ideas, or just say hello..."
              value={formData.message}
              onChange={(e) => handleInputChange('message', e.target.value)}
              onBlur={() => handleBlur('message')}
              className={`min-h-[120px] transition-all duration-200 resize-none ${
                errors.message && touched.message
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                  : touched.message && !errors.message
                  ? 'border-green-500 focus:border-green-500 focus:ring-green-500/20'
                  : 'focus:ring-blue-500/20'
              }`}
              disabled={status.type === 'submitting'}
            />
            <div className="flex justify-between items-center">
              {errors.message && touched.message ? (
                <p className="text-sm text-red-600 dark:text-red-400 animate-in slide-in-from-top-1 duration-200">
                  {errors.message}
                </p>
              ) : (
                <div />
              )}
              <p className={`text-xs transition-colors duration-200 ${
                formData.message.length > 900
                  ? 'text-red-500'
                  : formData.message.length > 800
                  ? 'text-yellow-500'
                  : 'text-gray-500'
              }`}>
                {formData.message.length}/1000
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={!isFormValid || status.type === 'submitting'}
            className={`w-full transition-all duration-300 transform ${
              status.type === 'submitting'
                ? 'scale-95'
                : 'hover:scale-105 active:scale-95'
            } ${
              isFormValid && status.type !== 'submitting'
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                : ''
            }`}
          >
            {status.type === 'submitting' ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Sending...</span>
              </div>
            ) : (
              'Send Message'
            )}
          </Button>
        </div>

        {/* Contact Info */}
        <div className="text-center pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Or reach out directly at{' '}
            <a
              href="mailto:hello@usmanramzan.ai"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              hello@usmanramzan.ai
            </a>
          </p>
        </div>
      </form>
    </div>
  )
}