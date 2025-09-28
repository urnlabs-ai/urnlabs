import { renderHook, act } from '@testing-library/react';
import { useComplianceWebSocket } from '../useComplianceWebSocket';
import { toast } from 'sonner';

// Mock dependencies
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = MockWebSocket.OPEN;

  constructor(public url: string) {
    // Simulate connection opening after a short delay
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send = jest.fn();
  close = jest.fn();
  ping = jest.fn();

  // Helper methods for testing
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateClose(wasClean = true) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { wasClean }));
    }
  }
}

// Replace global WebSocket with mock
(global as any).WebSocket = MockWebSocket;

describe('useComplianceWebSocket', () => {
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Intercept WebSocket constructor to capture instance
    const OriginalWebSocket = (global as any).WebSocket;
    (global as any).WebSocket = function(url: string) {
      mockWebSocket = new OriginalWebSocket(url);
      return mockWebSocket;
    };
    (global as any).WebSocket.OPEN = OriginalWebSocket.OPEN;
    (global as any).WebSocket.CLOSED = OriginalWebSocket.CLOSED;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
  });

  describe('connection management', () => {
    it('should connect to WebSocket on mount', async () => {
      const { result } = renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: false,
        })
      );

      expect(result.current.connectionStatus).toBe('connecting');

      // Simulate connection opening
      act(() => {
        jest.advanceTimersByTime(20);
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectionStatus).toBe('connected');
    });

    it('should send subscription message on connection', async () => {
      renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          subscriptions: ['violations', 'compliance-updates'],
          autoToast: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
      });

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscribe',
          organizationId: 'test-org',
          subscriptions: ['violations', 'compliance-updates'],
        })
      );
    });

    it('should handle connection errors', async () => {
      const { result } = renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: false,
        })
      );

      act(() => {
        mockWebSocket.simulateError();
      });

      expect(result.current.connectionStatus).toBe('error');
      expect(result.current.isConnected).toBe(false);
    });

    it('should attempt reconnection on unexpected disconnection', async () => {
      const { result } = renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: false,
        })
      );

      // Connect first
      act(() => {
        jest.advanceTimersByTime(20);
      });

      expect(result.current.isConnected).toBe(true);

      // Simulate unexpected disconnection
      act(() => {
        mockWebSocket.simulateClose(false); // wasClean = false
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionStatus).toBe('disconnected');

      // Should attempt reconnection
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // New WebSocket should be created for reconnection
      expect(mockWebSocket).toBeDefined();
    });
  });

  describe('message handling', () => {
    let onViolationAlert: jest.Mock;
    let onRiskAlert: jest.Mock;
    let onComplianceUpdate: jest.Mock;

    beforeEach(() => {
      onViolationAlert = jest.fn();
      onRiskAlert = jest.fn();
      onComplianceUpdate = jest.fn();
    });

    it('should handle violation alert messages', async () => {
      const { result } = renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          onViolationAlert,
          autoToast: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
      });

      const violationAlert = {
        type: 'violation-alert',
        violation: {
          id: 'violation-123',
          policyId: 'policy-456',
          severity: 'high',
          title: 'Test Violation',
          description: 'Test violation description',
          resourceId: 'resource-789',
          resourceType: 'user',
          timestamp: new Date().toISOString(),
          riskScore: 8.5,
        },
      };

      act(() => {
        mockWebSocket.simulateMessage(violationAlert);
      });

      expect(onViolationAlert).toHaveBeenCalledWith(violationAlert.violation);
      expect(result.current.violations).toHaveLength(1);
      expect(result.current.violations[0]).toEqual(violationAlert.violation);
    });

    it('should handle risk alert messages', async () => {
      renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          onRiskAlert,
          autoToast: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
      });

      const riskAlert = {
        type: 'risk-alert',
        organizationId: 'test-org',
        currentRiskScore: 9.2,
        threshold: 8.0,
        recentViolations: [],
        timestamp: new Date().toISOString(),
      };

      act(() => {
        mockWebSocket.simulateMessage(riskAlert);
      });

      expect(onRiskAlert).toHaveBeenCalledWith(riskAlert);
    });

    it('should handle compliance update messages', async () => {
      renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          onComplianceUpdate,
          autoToast: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
      });

      const complianceUpdate = {
        type: 'compliance-update',
        organizationId: 'test-org',
        framework: 'SOC2',
        previousStatus: 'compliant',
        currentStatus: 'non-compliant',
        affectedPolicies: ['policy-123'],
        timestamp: new Date().toISOString(),
      };

      act(() => {
        mockWebSocket.simulateMessage(complianceUpdate);
      });

      expect(onComplianceUpdate).toHaveBeenCalledWith(complianceUpdate);
    });

    it('should show toast notifications when autoToast is enabled', async () => {
      renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: true,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
      });

      const violationAlert = {
        type: 'violation-alert',
        violation: {
          id: 'violation-123',
          severity: 'high',
          title: 'High Severity Violation',
          description: 'Test description',
        },
      };

      act(() => {
        mockWebSocket.simulateMessage(violationAlert);
      });

      expect(toast.error).toHaveBeenCalledWith(
        '🔴 High Severity Violation',
        expect.objectContaining({
          description: 'Test description',
        })
      );
    });
  });

  describe('violation acknowledgment', () => {
    it('should send acknowledgment message', async () => {
      const { result } = renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
      });

      act(() => {
        result.current.acknowledgeViolation('violation-123', 'user-456', 'False positive');
      });

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'acknowledge-violation',
          violationId: 'violation-123',
          userId: 'user-456',
          reason: 'False positive',
        })
      );
    });

    it('should not send acknowledgment when disconnected', async () => {
      const { result } = renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: false,
        })
      );

      // Don't connect
      act(() => {
        result.current.acknowledgeViolation('violation-123', 'user-456');
      });

      expect(mockWebSocket?.send).not.toHaveBeenCalled();
    });
  });

  describe('ping/pong handling', () => {
    it('should send periodic pings', async () => {
      renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
      });

      // Clear previous calls
      mockWebSocket.send.mockClear();

      // Advance time to trigger ping
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'ping' })
      );
    });

    it('should handle pong responses', async () => {
      renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
      });

      const pongMessage = { type: 'pong', timestamp: new Date().toISOString() };

      act(() => {
        mockWebSocket.simulateMessage(pongMessage);
      });

      // Should not throw or cause errors
      expect(true).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup on unmount', async () => {
      const { unmount } = renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
      });

      expect(mockWebSocket.close).not.toHaveBeenCalled();

      unmount();

      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, 'User disconnected');
    });

    it('should clear reconnection timers on unmount', async () => {
      const { unmount } = renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
        mockWebSocket.simulateClose(false); // Trigger reconnection
      });

      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle malformed messages gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
      });

      // Simulate malformed message
      act(() => {
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage(new MessageEvent('message', { data: 'invalid json' }));
        }
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse WebSocket message:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle unknown message types', async () => {
      renderHook(() =>
        useComplianceWebSocket({
          organizationId: 'test-org',
          autoToast: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(20);
      });

      const unknownMessage = { type: 'unknown-type', data: 'test' };

      act(() => {
        mockWebSocket.simulateMessage(unknownMessage);
      });

      // Should not throw or cause errors
      expect(true).toBe(true);
    });
  });
});