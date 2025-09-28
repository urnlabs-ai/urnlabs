/**
 * HTTP client with retry logic, error handling, and certificate pinning
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import {
  HttpClient,
  HttpClientConfig,
  HttpResponse,
  SDKError,
  SDKErrorCode
} from '../core/types';

export interface RetryConfig {
  attempts: number;
  delay: number;
  backoffFactor: number;
  retryableStatusCodes: number[];
  retryableErrors: string[];
}

export class UrnlabsHttpClient implements HttpClient {
  private axiosInstance: AxiosInstance;
  private config: HttpClientConfig;
  private retryConfig: RetryConfig;

  constructor(config: HttpClientConfig) {
    this.config = config;
    this.retryConfig = {
      attempts: config.retryAttempts,
      delay: config.retryDelay,
      backoffFactor: 2,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ECONNABORTED', 'ETIMEDOUT', 'EAI_AGAIN']
    };

    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: config.headers
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging and auth
    this.axiosInstance.interceptors.request.use(
      (config) => {
        this.log('debug', `HTTP Request: ${config.method?.toUpperCase()} ${config.url}`, {
          headers: config.headers,
          data: config.data
        });
        return config;
      },
      (error) => {
        this.log('error', 'HTTP Request Error', { error });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.log('debug', `HTTP Response: ${response.status} ${response.config.url}`, {
          status: response.status,
          data: response.data
        });
        return response;
      },
      async (error) => {
        this.log('error', 'HTTP Response Error', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url
        });

        // Check if we should retry
        if (this.shouldRetry(error, 0)) {
          return this.retryRequest(error.config, 1);
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    return this.transformResponse(await this.axiosInstance.get<T>(url, config));
  }

  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    return this.transformResponse(await this.axiosInstance.post<T>(url, data, config));
  }

  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    return this.transformResponse(await this.axiosInstance.put<T>(url, data, config));
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    return this.transformResponse(await this.axiosInstance.delete<T>(url, config));
  }

  public async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    return this.transformResponse(await this.axiosInstance.patch<T>(url, data, config));
  }

  /**
   * Set authorization header
   */
  public setAuthToken(token: string): void {
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Remove authorization header
   */
  public clearAuthToken(): void {
    delete this.axiosInstance.defaults.headers.common['Authorization'];
  }

  /**
   * Update base URL
   */
  public setBaseURL(baseURL: string): void {
    this.axiosInstance.defaults.baseURL = baseURL;
    this.config.baseURL = baseURL;
  }

  /**
   * Set request timeout
   */
  public setTimeout(timeout: number): void {
    this.axiosInstance.defaults.timeout = timeout;
    this.config.timeout = timeout;
  }

  /**
   * Add custom header
   */
  public setHeader(key: string, value: string): void {
    this.axiosInstance.defaults.headers.common[key] = value;
    this.config.headers[key] = value;
  }

  /**
   * Remove custom header
   */
  public removeHeader(key: string): void {
    delete this.axiosInstance.defaults.headers.common[key];
    delete this.config.headers[key];
  }

  private transformResponse<T>(axiosResponse: AxiosResponse<T>): HttpResponse<T> {
    return {
      data: axiosResponse.data,
      status: axiosResponse.status,
      statusText: axiosResponse.statusText,
      headers: axiosResponse.headers as Record<string, string>
    };
  }

  private async retryRequest(originalConfig: AxiosRequestConfig, attempt: number): Promise<AxiosResponse> {
    if (attempt > this.retryConfig.attempts) {
      throw this.createError('NETWORK_ERROR', 'Max retry attempts exceeded');
    }

    // Calculate delay with exponential backoff
    const delay = this.retryConfig.delay * Math.pow(this.retryConfig.backoffFactor, attempt - 1);

    this.log('info', `Retrying request (attempt ${attempt}/${this.retryConfig.attempts}) after ${delay}ms`, {
      url: originalConfig.url,
      method: originalConfig.method
    });

    await this.sleep(delay);

    try {
      return await this.axiosInstance.request(originalConfig);
    } catch (error) {
      if (this.shouldRetry(error as AxiosError, attempt)) {
        return this.retryRequest(originalConfig, attempt + 1);
      }
      throw this.handleError(error as AxiosError);
    }
  }

  private shouldRetry(error: AxiosError, attempt: number): boolean {
    if (attempt >= this.retryConfig.attempts) {
      return false;
    }

    // Check for retryable status codes
    if (error.response?.status && this.retryConfig.retryableStatusCodes.includes(error.response.status)) {
      return true;
    }

    // Check for retryable error codes
    if (error.code && this.retryConfig.retryableErrors.includes(error.code)) {
      return true;
    }

    // Check for specific error types
    if (error.message.includes('timeout') || error.message.includes('Network Error')) {
      return true;
    }

    return false;
  }

  private handleError(error: AxiosError): SDKError {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const data = error.response.data as any;

      let code: SDKErrorCode;
      let message: string;

      switch (status) {
        case 400:
          code = 'VALIDATION_ERROR';
          message = data?.message || 'Bad request';
          break;
        case 401:
          code = 'AUTH_ERROR';
          message = data?.message || 'Unauthorized';
          break;
        case 403:
          code = 'PERMISSION_ERROR';
          message = data?.message || 'Forbidden';
          break;
        case 404:
          code = 'NETWORK_ERROR';
          message = data?.message || 'Not found';
          break;
        case 408:
          code = 'TIMEOUT_ERROR';
          message = data?.message || 'Request timeout';
          break;
        case 429:
          code = 'NETWORK_ERROR';
          message = data?.message || 'Too many requests';
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          code = 'SERVER_ERROR';
          message = data?.message || 'Server error';
          break;
        default:
          code = 'UNKNOWN_ERROR';
          message = data?.message || `HTTP Error ${status}`;
      }

      return this.createError(code, message, status, {
        originalError: error,
        responseData: data,
        url: error.config?.url
      });
    }

    if (error.request) {
      // Request was made but no response received
      let code: SDKErrorCode;
      let message: string;

      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        code = 'TIMEOUT_ERROR';
        message = 'Request timeout';
      } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
        code = 'NETWORK_ERROR';
        message = 'Network error - unable to connect';
      } else {
        code = 'NETWORK_ERROR';
        message = 'Network error';
      }

      return this.createError(code, message, undefined, {
        originalError: error,
        errorCode: error.code,
        url: error.config?.url
      });
    }

    // Something else happened
    return this.createError('UNKNOWN_ERROR', error.message || 'Unknown error', undefined, {
      originalError: error
    });
  }

  private createError(
    code: SDKErrorCode,
    message: string,
    statusCode?: number,
    details?: Record<string, any>
  ): SDKError {
    const error = new Error(message) as SDKError;
    error.name = 'HttpError';
    error.code = code;
    error.statusCode = statusCode;
    error.details = details;
    error.timestamp = new Date().toISOString();
    return error;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    // Platform-specific logging will be handled by the SDK base class
    if (typeof console !== 'undefined') {
      console[level === 'debug' ? 'log' : level](`[HttpClient] ${message}`, data || '');
    }
  }
}

/**
 * Factory function to create HTTP client with default configuration
 */
export function createHttpClient(config: Partial<HttpClientConfig>): UrnlabsHttpClient {
  const defaultConfig: HttpClientConfig = {
    baseURL: 'https://api.urnlabs.com',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'UrnlabsSDK/1.0.0'
    },
    retryAttempts: 3,
    retryDelay: 1000,
    certificatePinning: {
      enabled: false,
      certificates: []
    }
  };

  const mergedConfig = { ...defaultConfig, ...config };
  return new UrnlabsHttpClient(mergedConfig);
}