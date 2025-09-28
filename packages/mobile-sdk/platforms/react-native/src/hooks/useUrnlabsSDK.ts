/**
 * React hooks for Urnlabs SDK integration
 */

import { useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { UrnlabsContext } from '../context/UrnlabsProvider';
import {
  AuthState,
  WorkflowExecution,
  Agent,
  SDKError,
  UserCredentials
} from '@urnlabs/mobile-sdk-core';

/**
 * Main SDK hook - provides access to the SDK instance
 */
export function useUrnlabsSDK() {
  const context = useContext(UrnlabsContext);
  if (!context) {
    throw new Error('useUrnlabsSDK must be used within UrnlabsProvider');
  }
  return context;
}

/**
 * Authentication hook
 */
export function useAuth() {
  const { sdk } = useUrnlabsSDK();
  const [authState, setAuthState] = useState<AuthState>(() => sdk.getAuthState());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthChange = (event: any) => {
      setAuthState(event.data);
    };

    sdk.on('auth:state_changed', handleAuthChange);
    return () => sdk.off('auth:state_changed', handleAuthChange);
  }, [sdk]);

  const login = useCallback(async (credentials: UserCredentials) => {
    try {
      setIsLoading(true);
      setError(null);
      await sdk.auth.login(credentials);
    } catch (err) {
      const error = err as SDKError;
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      await sdk.auth.logout();
    } catch (err) {
      const error = err as SDKError;
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  const refreshTokens = useCallback(async () => {
    try {
      setError(null);
      await sdk.auth.refreshTokens();
    } catch (err) {
      const error = err as SDKError;
      setError(error.message);
      throw error;
    }
  }, [sdk]);

  return {
    ...authState,
    isLoading,
    error,
    login,
    logout,
    refreshTokens
  };
}

/**
 * Network connectivity hook
 */
export function useNetworkStatus() {
  const { sdk } = useUrnlabsSDK();
  const [isConnected, setIsConnected] = useState(true);
  const [connectionType, setConnectionType] = useState<string>('unknown');
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleNetworkChange = (event: any) => {
      setIsConnected(event.data.isConnected);
      setConnectionType(event.data.connectionType);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    sdk.on('network:changed', handleNetworkChange);
    sdk.on('sdk:online', handleOnline);
    sdk.on('sdk:offline', handleOffline);

    // Get initial status
    sdk.checkNetworkConnectivity().then(status => {
      setIsConnected(status.isConnected);
      setConnectionType(status.connectionType);
    });

    return () => {
      sdk.off('network:changed', handleNetworkChange);
      sdk.off('sdk:online', handleOnline);
      sdk.off('sdk:offline', handleOffline);
    };
  }, [sdk]);

  return {
    isConnected,
    connectionType,
    isOnline,
    checkConnectivity: useCallback(() => sdk.checkNetworkConnectivity(), [sdk])
  };
}

/**
 * Workflow management hook
 */
export function useWorkflow(workflowId?: string) {
  const { sdk } = useUrnlabsSDK();
  const [workflows, setWorkflows] = useState<WorkflowExecution[]>([]);
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowExecution | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch workflows
  const fetchWorkflows = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await sdk.workflows.list();
      setWorkflows(response.data);
    } catch (err) {
      const error = err as SDKError;
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  // Fetch specific workflow
  const fetchWorkflow = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await sdk.workflows.get(id);
      setCurrentWorkflow(response.data);
      return response.data;
    } catch (err) {
      const error = err as SDKError;
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  // Execute workflow
  const executeWorkflow = useCallback(async (id: string, input?: any) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await sdk.workflows.execute(id, input);
      await fetchWorkflows(); // Refresh list
      return response.data;
    } catch (err) {
      const error = err as SDKError;
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [sdk, fetchWorkflows]);

  // Cancel workflow
  const cancelWorkflow = useCallback(async (executionId: string) => {
    try {
      setError(null);
      await sdk.workflows.cancel(executionId);
      await fetchWorkflows(); // Refresh list
    } catch (err) {
      const error = err as SDKError;
      setError(error.message);
      throw error;
    }
  }, [sdk, fetchWorkflows]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  useEffect(() => {
    if (workflowId) {
      fetchWorkflow(workflowId);
    }
  }, [workflowId, fetchWorkflow]);

  // Listen for real-time workflow updates
  useEffect(() => {
    const handleWorkflowUpdate = (event: any) => {
      const updatedWorkflow = event.data.payload;

      setWorkflows(prev =>
        prev.map(w => w.id === updatedWorkflow.id ? updatedWorkflow : w)
      );

      if (currentWorkflow?.id === updatedWorkflow.id) {
        setCurrentWorkflow(updatedWorkflow);
      }
    };

    sdk.on('realtime:message', (event: any) => {
      if (event.data.type === 'workflow_update') {
        handleWorkflowUpdate(event);
      }
    });

    return () => {
      sdk.off('realtime:message', handleWorkflowUpdate);
    };
  }, [sdk, currentWorkflow]);

  return {
    workflows,
    currentWorkflow,
    isLoading,
    error,
    fetchWorkflows,
    fetchWorkflow,
    executeWorkflow,
    cancelWorkflow
  };
}

/**
 * Agent management hook
 */
export function useAgents() {
  const { sdk } = useUrnlabsSDK();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await sdk.agents.list();
      setAgents(response.data);
    } catch (err) {
      const error = err as SDKError;
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Listen for agent status updates
  useEffect(() => {
    const handleAgentUpdate = (event: any) => {
      if (event.data.type === 'agent_status') {
        const updatedAgent = event.data.payload;
        setAgents(prev =>
          prev.map(a => a.id === updatedAgent.id ? { ...a, ...updatedAgent } : a)
        );
      }
    };

    sdk.on('realtime:message', handleAgentUpdate);
    return () => sdk.off('realtime:message', handleAgentUpdate);
  }, [sdk]);

  return {
    agents,
    isLoading,
    error,
    fetchAgents,
    getAgent: useCallback((id: string) => agents.find(a => a.id === id), [agents])
  };
}

/**
 * Real-time messaging hook
 */
export function useRealtime(channel?: string) {
  const { sdk } = useUrnlabsSDK();
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const handleMessage = (event: any) => {
      setMessages(prev => [...prev, event.data]);
    };

    const handleConnected = () => setIsConnected(true);
    const handleDisconnected = () => setIsConnected(false);

    // Subscribe to channel or all messages
    const subscriptionId = sdk.websocket?.subscribe(channel || '*', handleMessage);

    sdk.on('websocket:connected', handleConnected);
    sdk.on('websocket:disconnected', handleDisconnected);

    return () => {
      if (subscriptionId) {
        sdk.websocket?.unsubscribe(subscriptionId);
      }
      sdk.off('websocket:connected', handleConnected);
      sdk.off('websocket:disconnected', handleDisconnected);
    };
  }, [sdk, channel]);

  const sendMessage = useCallback((message: any) => {
    return sdk.websocket?.send(message);
  }, [sdk]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isConnected,
    sendMessage,
    clearMessages
  };
}

/**
 * File upload hook
 */
export function useFileUpload() {
  const { sdk } = useUrnlabsSDK();
  const [uploads, setUploads] = useState<Map<string, any>>(new Map());

  const uploadFile = useCallback(async (file: File, onProgress?: (progress: number) => void) => {
    const uploadId = Date.now().toString();

    try {
      setUploads(prev => new Map(prev).set(uploadId, {
        id: uploadId,
        file,
        status: 'uploading',
        progress: 0
      }));

      const result = await sdk.files.upload(file, {
        onProgress: (progress) => {
          setUploads(prev => new Map(prev).set(uploadId, {
            ...prev.get(uploadId),
            progress
          }));
          onProgress?.(progress);
        }
      });

      setUploads(prev => new Map(prev).set(uploadId, {
        ...prev.get(uploadId),
        status: 'completed',
        result
      }));

      return result;
    } catch (error) {
      setUploads(prev => new Map(prev).set(uploadId, {
        ...prev.get(uploadId),
        status: 'failed',
        error
      }));
      throw error;
    }
  }, [sdk]);

  const removeUpload = useCallback((uploadId: string) => {
    setUploads(prev => {
      const newMap = new Map(prev);
      newMap.delete(uploadId);
      return newMap;
    });
  }, []);

  return {
    uploads: Array.from(uploads.values()),
    uploadFile,
    removeUpload
  };
}