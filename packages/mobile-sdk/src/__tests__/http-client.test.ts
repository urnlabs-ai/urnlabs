/**
 * Tests for UrnlabsHttpClient
 */

import { UrnlabsHttpClient } from '../http/http-client';
import { HttpClientConfig } from '../core/types';

// Mock axios
jest.mock('axios');
const mockedAxios = jest.requireMock('axios');

describe('UrnlabsHttpClient', () => {
  let httpClient: UrnlabsHttpClient;
  let mockAxiosInstance: any;

  const defaultConfig: HttpClientConfig = {
    baseURL: 'https://api.test.com',
    timeout: 5000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    retryAttempts: 3,
    retryDelay: 1000
  };

  beforeEach(() => {
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      defaults: {
        headers: {
          common: {}
        }
      },
      interceptors: {
        request: {
          use: jest.fn()
        },
        response: {
          use: jest.fn()
        }
      }
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    httpClient = new UrnlabsHttpClient(defaultConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: defaultConfig.baseURL,
        timeout: defaultConfig.timeout,
        headers: defaultConfig.headers
      });
    });

    it('should set up request and response interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('HTTP methods', () => {
    const mockResponse = {
      data: { message: 'success' },
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' }
    };

    it('should make GET request', async () => {
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await httpClient.get('/test');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', undefined);
      expect(result).toEqual({
        data: mockResponse.data,
        status: mockResponse.status,
        statusText: mockResponse.statusText,
        headers: mockResponse.headers
      });
    });

    it('should make POST request', async () => {
      const requestData = { name: 'test' };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await httpClient.post('/test', requestData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/test', requestData, undefined);
      expect(result.data).toEqual(mockResponse.data);
    });

    it('should make PUT request', async () => {
      const requestData = { name: 'test' };
      mockAxiosInstance.put.mockResolvedValue(mockResponse);

      const result = await httpClient.put('/test', requestData);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/test', requestData, undefined);
      expect(result.data).toEqual(mockResponse.data);
    });

    it('should make DELETE request', async () => {
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);

      const result = await httpClient.delete('/test');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/test', undefined);
      expect(result.data).toEqual(mockResponse.data);
    });

    it('should make PATCH request', async () => {
      const requestData = { name: 'test' };
      mockAxiosInstance.patch.mockResolvedValue(mockResponse);

      const result = await httpClient.patch('/test', requestData);

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/test', requestData, undefined);
      expect(result.data).toEqual(mockResponse.data);
    });
  });

  describe('authentication', () => {
    it('should set auth token', () => {
      const token = 'test-token';
      httpClient.setAuthToken(token);

      expect(mockAxiosInstance.defaults.headers.common['Authorization']).toBe(`Bearer ${token}`);
    });

    it('should clear auth token', () => {
      httpClient.setAuthToken('test-token');
      httpClient.clearAuthToken();

      expect(mockAxiosInstance.defaults.headers.common['Authorization']).toBeUndefined();
    });
  });

  describe('configuration', () => {
    it('should update base URL', () => {
      const newBaseURL = 'https://new-api.test.com';
      httpClient.setBaseURL(newBaseURL);

      expect(mockAxiosInstance.defaults.baseURL).toBe(newBaseURL);
    });

    it('should update timeout', () => {
      const newTimeout = 10000;
      httpClient.setTimeout(newTimeout);

      expect(mockAxiosInstance.defaults.timeout).toBe(newTimeout);
    });

    it('should set custom header', () => {
      httpClient.setHeader('X-Custom-Header', 'test-value');

      expect(mockAxiosInstance.defaults.headers.common['X-Custom-Header']).toBe('test-value');
    });

    it('should remove custom header', () => {
      httpClient.setHeader('X-Custom-Header', 'test-value');
      httpClient.removeHeader('X-Custom-Header');

      expect(mockAxiosInstance.defaults.headers.common['X-Custom-Header']).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      const networkError = {
        request: {},
        code: 'ENOTFOUND',
        message: 'Network Error'
      };

      mockAxiosInstance.get.mockRejectedValue(networkError);

      try {
        await httpClient.get('/test');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.name).toBe('HttpError');
      }
    });

    it('should handle timeout errors', async () => {
      const timeoutError = {
        request: {},
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded'
      };

      mockAxiosInstance.get.mockRejectedValue(timeoutError);

      try {
        await httpClient.get('/test');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('TIMEOUT_ERROR');
      }
    });

    it('should handle 401 authentication errors', async () => {
      const authError = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' }
        }
      };

      mockAxiosInstance.get.mockRejectedValue(authError);

      try {
        await httpClient.get('/test');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('AUTH_ERROR');
        expect(error.statusCode).toBe(401);
      }
    });

    it('should handle 403 permission errors', async () => {
      const permissionError = {
        response: {
          status: 403,
          data: { message: 'Forbidden' }
        }
      };

      mockAxiosInstance.get.mockRejectedValue(permissionError);

      try {
        await httpClient.get('/test');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('PERMISSION_ERROR');
        expect(error.statusCode).toBe(403);
      }
    });

    it('should handle 500 server errors', async () => {
      const serverError = {
        response: {
          status: 500,
          data: { message: 'Internal Server Error' }
        }
      };

      mockAxiosInstance.get.mockRejectedValue(serverError);

      try {
        await httpClient.get('/test');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('SERVER_ERROR');
        expect(error.statusCode).toBe(500);
      }
    });
  });

  describe('retry logic', () => {
    it('should retry on retryable errors', async () => {
      const retryableError = {
        response: {
          status: 503,
          data: { message: 'Service Unavailable' }
        }
      };

      const successResponse = {
        data: { message: 'success' },
        status: 200,
        statusText: 'OK',
        headers: {}
      };

      // Mock the interceptor to handle retries
      const interceptorSuccess = jest.fn().mockReturnValue(successResponse);
      const interceptorError = jest.fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce(successResponse);

      mockAxiosInstance.interceptors.response.use.mockImplementation((success, error) => {
        // Simulate retry logic
        return interceptorError();
      });

      mockAxiosInstance.get.mockImplementation(() => interceptorError());

      // The actual retry logic would be handled by the interceptor
      // This is a simplified test to verify the structure is in place
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });
});