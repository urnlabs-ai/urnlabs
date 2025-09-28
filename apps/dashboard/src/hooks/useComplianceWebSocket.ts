import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface ViolationAlert {
  id: string;
  policyId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  resourceId: string;
  resourceType: string;
  timestamp: string;
  riskScore: number;
}

export interface RiskAlert {
  organizationId: string;
  currentRiskScore: number;
  threshold: number;
  recentViolations: ViolationAlert[];
  timestamp: string;
}

export interface ComplianceUpdate {
  organizationId: string;
  framework: string;
  previousStatus: string;
  currentStatus: string;
  affectedPolicies: string[];
  timestamp: string;
}

export interface WSMessage {
  type: 'connected' | 'violation-alert' | 'risk-alert' | 'compliance-update' | 'violation-acknowledged' | 'error' | 'pong';
  [key: string]: any;
}

interface UseComplianceWebSocketOptions {
  organizationId: string;
  subscriptions?: ('violations' | 'compliance-updates' | 'policy-changes' | 'audit-events')[];
  onViolationAlert?: (violation: ViolationAlert) => void;
  onRiskAlert?: (risk: RiskAlert) => void;
  onComplianceUpdate?: (update: ComplianceUpdate) => void;
  autoToast?: boolean;
}

export function useComplianceWebSocket({
  organizationId,
  subscriptions = ['violations', 'compliance-updates'],
  onViolationAlert,
  onRiskAlert,
  onComplianceUpdate,
  autoToast = true
}: UseComplianceWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [violations, setViolations] = useState<ViolationAlert[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');

    // Use environment variable for WebSocket URL or fallback to default
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:7001/ws/compliance';

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;

        // Subscribe to events
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'subscribe',
            organizationId,
            subscriptions
          }));
        }

        if (autoToast) {
          toast.success('Connected to compliance monitoring');
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          setLastMessage(message);

          switch (message.type) {
            case 'violation-alert':
              const violation = message.violation as ViolationAlert;
              setViolations(prev => [violation, ...prev.slice(0, 99)]); // Keep last 100
              onViolationAlert?.(violation);

              if (autoToast) {
                const severityColors = {
                  low: '🟡',
                  medium: '🟠',
                  high: '🔴',
                  critical: '🚨'
                };
                toast.error(`${severityColors[violation.severity]} ${violation.title}`, {
                  description: violation.description,
                  action: {
                    label: 'View Details',
                    onClick: () => {
                      // This could trigger a modal or navigation
                      console.log('View violation details:', violation.id);
                    }
                  }
                });
              }
              break;

            case 'risk-alert':
              const riskAlert = message as RiskAlert;
              onRiskAlert?.(riskAlert);

              if (autoToast) {
                toast.warning(`Risk threshold exceeded: ${riskAlert.currentRiskScore}/${riskAlert.threshold}`, {
                  description: `${riskAlert.recentViolations.length} recent violations detected`
                });
              }
              break;

            case 'compliance-update':
              const complianceUpdate = message as ComplianceUpdate;
              onComplianceUpdate?.(complianceUpdate);

              if (autoToast) {
                toast.info(`Compliance status updated for ${complianceUpdate.framework}`, {
                  description: `Status changed from ${complianceUpdate.previousStatus} to ${complianceUpdate.currentStatus}`
                });
              }
              break;

            case 'violation-acknowledged':
              if (autoToast) {
                toast.success('Violation acknowledged');
              }
              break;

            case 'error':
              console.error('WebSocket error:', message.message);
              if (autoToast) {
                toast.error('WebSocket error', {
                  description: message.message
                });
              }
              break;
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        setIsConnected(false);
        setConnectionStatus('disconnected');

        if (!event.wasClean && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;

          if (autoToast) {
            toast.warning(`Connection lost. Reconnecting in ${delay / 1000}s...`);
          }

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionStatus('error');
          if (autoToast) {
            toast.error('Failed to reconnect to compliance monitoring');
          }
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
        if (autoToast) {
          toast.error('WebSocket connection error');
        }
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
      if (autoToast) {
        toast.error('Failed to connect to compliance monitoring');
      }
    }
  }, [organizationId, subscriptions, onViolationAlert, onRiskAlert, onComplianceUpdate, autoToast]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionStatus('disconnected');
  }, []);

  const acknowledgeViolation = useCallback((violationId: string, userId: string, reason?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'acknowledge-violation',
        violationId,
        userId,
        reason
      }));
    }
  }, []);

  const sendPing = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ping' }));
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();

    // Send periodic pings
    const pingInterval = setInterval(sendPing, 30000);

    return () => {
      clearInterval(pingInterval);
      disconnect();
    };
  }, [connect, disconnect, sendPing]);

  // Reconnect when organizationId changes
  useEffect(() => {
    if (isConnected) {
      disconnect();
      setTimeout(connect, 100);
    }
  }, [organizationId]);

  return {
    isConnected,
    connectionStatus,
    lastMessage,
    violations,
    connect,
    disconnect,
    acknowledgeViolation,
    sendPing
  };
}