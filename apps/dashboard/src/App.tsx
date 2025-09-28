import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { AuthProvider } from '@/providers/AuthProvider'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

// Pages
import { DashboardPage } from '@/pages/dashboard'
import { AgentsPage } from '@/pages/agents'
import { WorkflowsPage } from '@/pages/workflows'
import { AnalyticsPage } from '@/pages/analytics'
import { SettingsPage } from '@/pages/settings'
import { TeamPage } from '@/pages/team'
import { DataSourcesPage } from '@/pages/data-sources'
import { SecurityPage } from '@/pages/security'
import { HelpPage } from '@/pages/help'

// Auth Pages
import { LoginPage } from '@/pages/auth/login'
import { SignupPage } from '@/pages/auth/signup'
import { ForgotPasswordPage } from '@/pages/auth/forgot-password'
import { ResetPasswordPage } from '@/pages/auth/reset-password'

import { NotFoundPage } from '@/pages/not-found'

function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="workflows" element={<WorkflowsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="data-sources" element={<DataSourcesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="security" element={<SecurityPage />} />
              <Route path="help" element={<HelpPage />} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Router>

        <Toaster
          theme="system"
          position="bottom-right"
          richColors
          closeButton
          duration={4000}
        />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App