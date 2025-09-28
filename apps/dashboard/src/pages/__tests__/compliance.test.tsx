import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CompliancePage from '../compliance';
import { useComplianceWebSocket } from '../../hooks/useComplianceWebSocket';
import { toast } from 'sonner';

// Mock dependencies
jest.mock('../../hooks/useComplianceWebSocket');
jest.mock('sonner');
jest.mock('date-fns', () => ({
  format: jest.fn((date, formatStr) => '12:34:56'),
  subDays: jest.fn((date, days) => new Date(date.getTime() - days * 24 * 60 * 60 * 1000)),
  subWeeks: jest.fn((date, weeks) => new Date(date.getTime() - weeks * 7 * 24 * 60 * 60 * 1000)),
  subMonths: jest.fn((date, months) => new Date(date.getTime() - months * 30 * 24 * 60 * 60 * 1000)),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockUseComplianceWebSocket = useComplianceWebSocket as jest.MockedFunction<typeof useComplianceWebSocket>;

describe('CompliancePage', () => {
  let queryClient: QueryClient;

  const mockDashboardData = {
    overview: {
      complianceRate: 85.5,
      totalViolations: 23,
      riskScore: 6.8,
      totalRules: 45,
      activeRules: 42,
    },
    recentViolations: [
      {
        id: 'violation-1',
        policyId: 'policy-123',
        severity: 'high',
        status: 'new',
        title: 'Unauthorized Access Attempt',
        description: 'User attempted to access restricted resource',
        resourceId: 'resource-456',
        resourceType: 'database',
        timestamp: new Date().toISOString(),
        riskScore: 8.2,
      },
      {
        id: 'violation-2',
        policyId: 'policy-456',
        severity: 'medium',
        status: 'acknowledged',
        title: 'Data Retention Policy Violation',
        description: 'Data retained beyond policy limits',
        resourceId: 'resource-789',
        resourceType: 'storage',
        timestamp: new Date().toISOString(),
        riskScore: 5.5,
      },
    ],
    frameworkStatus: [
      {
        framework: 'SOC2',
        complianceRate: 90,
        totalPolicies: 15,
        violations: 2,
        status: 'compliant',
      },
      {
        framework: 'GDPR',
        complianceRate: 75,
        totalPolicies: 20,
        violations: 8,
        status: 'non-compliant',
      },
    ],
    policyStatistics: {
      total: 50,
      active: 45,
      expiringCount: 3,
      byType: {
        'access_control': 20,
        'data_retention': 15,
        'security_scanning': 10,
      },
      byRiskLevel: {
        high: 5,
        medium: 25,
        low: 20,
      },
    },
    trends: {
      violationTrend: [
        { date: '2024-01-01', violations: 5, riskScore: 6.2 },
        { date: '2024-01-02', violations: 8, riskScore: 7.1 },
        { date: '2024-01-03', violations: 3, riskScore: 5.8 },
      ],
      complianceHistory: [
        { date: '2024-01-01', rate: 88 },
        { date: '2024-01-02', rate: 85 },
        { date: '2024-01-03', rate: 87 },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Mock WebSocket hook
    mockUseComplianceWebSocket.mockReturnValue({
      isConnected: true,
      connectionStatus: 'connected',
      lastMessage: null,
      violations: [],
      connect: jest.fn(),
      disconnect: jest.fn(),
      acknowledgeViolation: jest.fn(),
      sendPing: jest.fn(),
    });

    // Mock successful fetch responses
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: mockDashboardData,
      }),
    });
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <CompliancePage />
      </QueryClientProvider>
    );
  };

  describe('basic rendering', () => {
    it('should render dashboard header', async () => {
      renderComponent();

      expect(screen.getByText('Compliance Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Real-time compliance monitoring and policy violation detection')).toBeInTheDocument();
    });

    it('should show connection status', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Live')).toBeInTheDocument();
      });
    });

    it('should render overview cards', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('85.5%')).toBeInTheDocument(); // Compliance rate
        expect(screen.getByText('23')).toBeInTheDocument(); // Total violations
        expect(screen.getByText('6.8')).toBeInTheDocument(); // Risk score
      });
    });
  });

  describe('tab navigation', () => {
    it('should switch between tabs', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Overview')).toBeInTheDocument();
      });

      // Switch to violations tab
      fireEvent.click(screen.getByText('Violations'));
      expect(screen.getByText('Recent Violations')).toBeInTheDocument();

      // Switch to frameworks tab
      fireEvent.click(screen.getByText('Frameworks'));
      expect(screen.getByText('Framework Compliance Status')).toBeInTheDocument();
    });
  });

  describe('violations management', () => {
    it('should display violations in table', async () => {
      renderComponent();

      // Navigate to violations tab
      await waitFor(() => {
        fireEvent.click(screen.getByText('Violations'));
      });

      await waitFor(() => {
        expect(screen.getByText('Unauthorized Access Attempt')).toBeInTheDocument();
        expect(screen.getByText('Data Retention Policy Violation')).toBeInTheDocument();
      });
    });

    it('should allow violation acknowledgment', async () => {
      const mockAcknowledgeViolation = jest.fn();
      mockUseComplianceWebSocket.mockReturnValue({
        isConnected: true,
        connectionStatus: 'connected',
        lastMessage: null,
        violations: [],
        connect: jest.fn(),
        disconnect: jest.fn(),
        acknowledgeViolation: mockAcknowledgeViolation,
        sendPing: jest.fn(),
      });

      renderComponent();

      // Navigate to violations tab
      await waitFor(() => {
        fireEvent.click(screen.getByText('Violations'));
      });

      // Mock successful acknowledgment API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      // Click acknowledge button
      await waitFor(() => {
        const acknowledgeButtons = screen.getAllByText('Acknowledge');
        fireEvent.click(acknowledgeButtons[0]);
      });

      expect(mockAcknowledgeViolation).toHaveBeenCalledWith('violation-1', 'current-user-id');
    });

    it('should filter violations by severity', async () => {
      renderComponent();

      await waitFor(() => {
        fireEvent.click(screen.getByText('Violations'));
      });

      // Find and click severity filter
      const severitySelect = screen.getByDisplayValue('All Severities');
      fireEvent.click(severitySelect);

      // Select high severity
      fireEvent.click(screen.getByText('High'));

      // Should make new API call with filter
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('severity=high'),
          expect.any(Object)
        );
      });
    });
  });

  describe('report generation', () => {
    it('should generate PDF report', async () => {
      // Mock blob response for PDF
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['pdf content'], { type: 'application/pdf' })),
        headers: {
          get: (name: string) => name === 'content-type' ? 'application/pdf' : null,
        },
      });

      // Mock URL.createObjectURL
      const mockCreateObjectURL = jest.fn(() => 'blob:mock-url');
      global.URL.createObjectURL = mockCreateObjectURL;

      renderComponent();

      await waitFor(() => {
        const pdfButton = screen.getByText('Export PDF');
        fireEvent.click(pdfButton);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/compliance/reports/generate',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
            body: expect.stringContaining('"format":"pdf"'),
          })
        );
      });

      expect(toast.success).toHaveBeenCalledWith('PDF report generated successfully');
    });

    it('should handle report generation errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      renderComponent();

      await waitFor(() => {
        const pdfButton = screen.getByText('Export PDF');
        fireEvent.click(pdfButton);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to generate compliance report');
      });
    });
  });

  describe('real-time updates', () => {
    it('should handle incoming violation alerts', async () => {
      const mockViolation = {
        id: 'new-violation',
        severity: 'critical',
        title: 'Critical Security Breach',
        description: 'Immediate attention required',
      };

      let onViolationAlert: ((violation: any) => void) | undefined;

      mockUseComplianceWebSocket.mockImplementation((options) => {
        onViolationAlert = options.onViolationAlert;
        return {
          isConnected: true,
          connectionStatus: 'connected',
          lastMessage: null,
          violations: [],
          connect: jest.fn(),
          disconnect: jest.fn(),
          acknowledgeViolation: jest.fn(),
          sendPing: jest.fn(),
        };
      });

      renderComponent();

      // Simulate incoming violation
      if (onViolationAlert) {
        onViolationAlert(mockViolation);
      }

      // Should refresh dashboard data
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/compliance/dashboard'),
          expect.any(Object)
        );
      });
    });

    it('should show disconnected status when WebSocket fails', async () => {
      mockUseComplianceWebSocket.mockReturnValue({
        isConnected: false,
        connectionStatus: 'error',
        lastMessage: null,
        violations: [],
        connect: jest.fn(),
        disconnect: jest.fn(),
        acknowledgeViolation: jest.fn(),
        sendPing: jest.fn(),
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
      });
    });
  });

  describe('framework compliance', () => {
    it('should display framework status', async () => {
      renderComponent();

      await waitFor(() => {
        fireEvent.click(screen.getByText('Frameworks'));
      });

      await waitFor(() => {
        expect(screen.getByText('SOC2')).toBeInTheDocument();
        expect(screen.getByText('GDPR')).toBeInTheDocument();
        expect(screen.getByText('90%')).toBeInTheDocument(); // SOC2 compliance rate
        expect(screen.getByText('75%')).toBeInTheDocument(); // GDPR compliance rate
      });
    });
  });

  describe('error handling', () => {
    it('should handle dashboard data loading errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      renderComponent();

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to load compliance dashboard');
      });
    });

    it('should show loading state', async () => {
      // Make fetch hang to test loading state
      mockFetch.mockImplementation(() => new Promise(() => {}));

      renderComponent();

      expect(screen.getByText('Loading compliance dashboard...')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('tablist')).toBeInTheDocument();
        expect(screen.getByRole('tabpanel')).toBeInTheDocument();
      });
    });

    it('should support keyboard navigation', async () => {
      renderComponent();

      await waitFor(() => {
        const firstTab = screen.getByRole('tab', { name: 'Overview' });
        firstTab.focus();
        expect(document.activeElement).toBe(firstTab);
      });
    });
  });
});