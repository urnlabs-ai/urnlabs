import { WebSocketServer, WebSocket } from 'ws';
import { ComplianceWebSocketService } from '../websocket-service';
import { ViolationDetectionService } from '../violation-detection-service';
import { Server } from 'http';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('ws');
jest.mock('../violation-detection-service');
jest.mock('../lib/logger');

describe('ComplianceWebSocketService', () => {
  let websocketService: ComplianceWebSocketService;
  let mockViolationService: jest.Mocked<ViolationDetectionService>;
  let mockServer: jest.Mocked<Server>;
  let mockWSS: jest.Mocked<WebSocketServer>;
  let mockWS: jest.Mocked<WebSocket>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock violation service
    mockViolationService = {
      on: jest.fn(),
      emit: jest.fn(),
      processEvaluationResult: jest.fn(),
      configureAlerts: jest.fn(),
      getRecentViolations: jest.fn(),
      getRiskMetrics: jest.fn(),
    } as any;

    // Create mock WebSocket
    mockWS = {
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      readyState: WebSocket.OPEN,
    } as any;

    // Create mock WebSocketServer
    mockWSS = {
      on: jest.fn(),
      close: jest.fn(),
      clients: new Set(),
    } as any;

    // Create mock HTTP server
    mockServer = {
      listen: jest.fn(),
      close: jest.fn(),
    } as any;

    // Mock WebSocketServer constructor
    (WebSocketServer as jest.MockedClass<typeof WebSocketServer>).mockImplementation(() => mockWSS);

    websocketService = new ComplianceWebSocketService(mockViolationService);
  });

  afterEach(() => {
    websocketService.shutdown();
  });

  describe('initialization', () => {
    it('should initialize WebSocket server successfully', () => {
      websocketService.initialize(mockServer);

      expect(WebSocketServer).toHaveBeenCalledWith({
        server: mockServer,
        path: '/ws/compliance',
        clientTracking: true,
      });

      expect(mockWSS.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should setup violation service listeners', () => {
      expect(mockViolationService.on).toHaveBeenCalledWith('violation-detected', expect.any(Function));
      expect(mockViolationService.on).toHaveBeenCalledWith('risk-threshold-exceeded', expect.any(Function));
      expect(mockViolationService.on).toHaveBeenCalledWith('compliance-status-changed', expect.any(Function));
    });
  });

  describe('client connection handling', () => {
    beforeEach(() => {
      websocketService.initialize(mockServer);
    });

    it('should handle new client connections', () => {
      const connectionHandler = mockWSS.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      expect(connectionHandler).toBeDefined();

      // Simulate connection
      connectionHandler?.(mockWS, {} as any);

      expect(mockWS.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWS.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWS.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockWS.on).toHaveBeenCalledWith('pong', expect.any(Function));
    });

    it('should send welcome message on connection', () => {
      const connectionHandler = mockWSS.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      connectionHandler?.(mockWS, {} as any);

      expect(mockWS.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"connected"')
      );
    });
  });

  describe('message handling', () => {
    let messageHandler: (data: any) => void;

    beforeEach(() => {
      websocketService.initialize(mockServer);
      const connectionHandler = mockWSS.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      connectionHandler?.(mockWS, {} as any);

      messageHandler = mockWS.on.mock.calls.find(call => call[0] === 'message')?.[1];
    });

    it('should handle subscribe messages', () => {
      const subscribeMessage = {
        type: 'subscribe',
        organizationId: 'test-org',
        subscriptions: ['violations', 'compliance-updates'],
      };

      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));

      expect(mockWS.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"subscribed"')
      );
    });

    it('should handle unsubscribe messages', () => {
      // First subscribe
      const subscribeMessage = {
        type: 'subscribe',
        organizationId: 'test-org',
        subscriptions: ['violations'],
      };
      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));

      // Then unsubscribe
      const unsubscribeMessage = {
        type: 'unsubscribe',
        organizationId: 'test-org',
        subscriptions: ['violations'],
      };
      messageHandler(Buffer.from(JSON.stringify(unsubscribeMessage)));

      expect(mockWS.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"unsubscribed"')
      );
    });

    it('should handle ping messages', () => {
      const pingMessage = { type: 'ping' };
      messageHandler(Buffer.from(JSON.stringify(pingMessage)));

      expect(mockWS.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"pong"')
      );
    });

    it('should handle violation acknowledgment messages', () => {
      const ackMessage = {
        type: 'acknowledge-violation',
        violationId: 'violation-123',
        userId: 'user-456',
        reason: 'False positive',
      };

      messageHandler(Buffer.from(JSON.stringify(ackMessage)));

      expect(mockWS.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"violation-acknowledged"')
      );
    });

    it('should handle invalid message format', () => {
      messageHandler(Buffer.from('invalid json'));

      expect(mockWS.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
    });
  });

  describe('violation broadcasting', () => {
    beforeEach(() => {
      websocketService.initialize(mockServer);
    });

    it('should broadcast violation alerts to subscribed clients', () => {
      // Setup a mock client
      const connectionHandler = mockWSS.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      connectionHandler?.(mockWS, {} as any);

      // Subscribe to violations
      const messageHandler = mockWS.on.mock.calls.find(call => call[0] === 'message')?.[1];
      const subscribeMessage = {
        type: 'subscribe',
        organizationId: 'test-org',
        subscriptions: ['violations'],
      };
      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));

      // Simulate violation detection
      const violationListener = mockViolationService.on.mock.calls.find(
        call => call[0] === 'violation-detected'
      )?.[1];

      const mockViolation = {
        id: 'violation-123',
        organizationId: 'test-org',
        policyId: 'policy-456',
        severity: 'high',
        title: 'Test Violation',
        description: 'Test violation description',
        resourceId: 'resource-789',
        resourceType: 'user',
        timestamp: new Date().toISOString(),
        riskScore: 8.5,
      };

      violationListener?.(mockViolation);

      expect(mockWS.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"violation-alert"')
      );
    });

    it('should broadcast risk alerts', () => {
      const connectionHandler = mockWSS.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      connectionHandler?.(mockWS, {} as any);

      const riskListener = mockViolationService.on.mock.calls.find(
        call => call[0] === 'risk-threshold-exceeded'
      )?.[1];

      const mockRiskAlert = {
        organizationId: 'test-org',
        currentRiskScore: 9.2,
        threshold: 8.0,
        recentViolations: [],
      };

      riskListener?.(mockRiskAlert);

      expect(mockWS.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"risk-alert"')
      );
    });
  });

  describe('connection statistics', () => {
    beforeEach(() => {
      websocketService.initialize(mockServer);
    });

    it('should return accurate connection statistics', () => {
      const stats = websocketService.getConnectionStats();

      expect(stats).toEqual({
        totalConnections: 0,
        connectionsByOrganization: {},
        activeSubscriptions: {},
      });
    });

    it('should track organization connections', () => {
      // Simulate connection and subscription
      const connectionHandler = mockWSS.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      connectionHandler?.(mockWS, {} as any);

      const messageHandler = mockWS.on.mock.calls.find(call => call[0] === 'message')?.[1];
      const subscribeMessage = {
        type: 'subscribe',
        organizationId: 'test-org',
        subscriptions: ['violations'],
      };
      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));

      const stats = websocketService.getConnectionStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.connectionsByOrganization['test-org']).toBe(1);
      expect(stats.activeSubscriptions['violations']).toBe(1);
    });
  });

  describe('shutdown', () => {
    it('should cleanup resources on shutdown', () => {
      websocketService.initialize(mockServer);
      websocketService.shutdown();

      expect(mockWSS.close).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      websocketService.initialize(mockServer);
    });

    it('should handle WebSocket errors gracefully', () => {
      const connectionHandler = mockWSS.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      connectionHandler?.(mockWS, {} as any);

      const errorHandler = mockWS.on.mock.calls.find(call => call[0] === 'error')?.[1];
      errorHandler?.(new Error('Test error'));

      // Should not throw and handle gracefully
      expect(true).toBe(true);
    });

    it('should handle client disconnection', () => {
      const connectionHandler = mockWSS.on.mock.calls.find(call => call[0] === 'connection')?.[1];
      connectionHandler?.(mockWS, {} as any);

      const closeHandler = mockWS.on.mock.calls.find(call => call[0] === 'close')?.[1];
      closeHandler?.({ wasClean: true });

      // Should cleanup client without errors
      const stats = websocketService.getConnectionStats();
      expect(stats.totalConnections).toBe(0);
    });
  });
});