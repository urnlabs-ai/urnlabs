import axios, { AxiosInstance } from 'axios';
import { createLogger } from './logger';

const logger = createLogger('VaultClient');

export interface VaultConfig {
  address: string;
  roleId: string;
  secretId: string;
  namespace?: string;
  timeout?: number;
}

export interface VaultSecret {
  [key: string]: string | number | boolean;
}

export interface VaultResponse<T = VaultSecret> {
  data: {
    data: T;
    metadata: {
      created_time: string;
      custom_metadata: Record<string, string>;
      deletion_time: string;
      destroyed: boolean;
      version: number;
    };
  };
}

export interface VaultAuthResponse {
  auth: {
    client_token: string;
    accessor: string;
    policies: string[];
    token_policies: string[];
    lease_duration: number;
    renewable: boolean;
  };
}

export class VaultClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;
  private config: VaultConfig;

  constructor(config: VaultConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `${config.address}/v1`,
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.namespace && { 'X-Vault-Namespace': config.namespace }),
      },
    });

    // Add request interceptor to ensure authentication
    this.client.interceptors.request.use(async (config) => {
      await this.ensureAuthenticated();
      if (this.token) {
        config.headers['X-Vault-Token'] = this.token;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          logger.warn('Vault token expired or invalid, re-authenticating...');
          this.token = null;
          this.tokenExpiry = null;
          await this.authenticate();
          // Retry the original request
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Authenticate with Vault using AppRole
   */
  private async authenticate(): Promise<void> {
    try {
      logger.info('Authenticating with Vault using AppRole...');

      const response = await axios.post(
        `${this.config.address}/v1/auth/approle/login`,
        {
          role_id: this.config.roleId,
          secret_id: this.config.secretId,
        },
        {
          timeout: this.config.timeout || 10000,
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.namespace && { 'X-Vault-Namespace': this.config.namespace }),
          },
        }
      );

      const authData: VaultAuthResponse = response.data;
      this.token = authData.auth.client_token;

      // Calculate token expiry (with 5 minute buffer)
      const expirySeconds = authData.auth.lease_duration - 300;
      this.tokenExpiry = new Date(Date.now() + (expirySeconds * 1000));

      logger.info('Successfully authenticated with Vault', {
        policies: authData.auth.policies,
        expiresAt: this.tokenExpiry.toISOString(),
      });
    } catch (error) {
      logger.error('Failed to authenticate with Vault', error);
      throw new Error(`Vault authentication failed: ${error.message}`);
    }
  }

  /**
   * Ensure we have a valid token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.token || !this.tokenExpiry || new Date() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  /**
   * Read a secret from Vault
   */
  async readSecret<T = VaultSecret>(path: string): Promise<T> {
    try {
      logger.debug(`Reading secret from path: ${path}`);

      const response = await this.client.get<VaultResponse<T>>(`secret/data/${path}`);

      logger.debug(`Successfully read secret from path: ${path}`);
      return response.data.data.data;
    } catch (error) {
      logger.error(`Failed to read secret from path: ${path}`, error);
      throw new Error(`Failed to read secret from ${path}: ${error.message}`);
    }
  }

  /**
   * Write a secret to Vault
   */
  async writeSecret(path: string, data: VaultSecret): Promise<void> {
    try {
      logger.debug(`Writing secret to path: ${path}`);

      await this.client.post(`secret/data/${path}`, { data });

      logger.info(`Successfully wrote secret to path: ${path}`);
    } catch (error) {
      logger.error(`Failed to write secret to path: ${path}`, error);
      throw new Error(`Failed to write secret to ${path}: ${error.message}`);
    }
  }

  /**
   * Delete a secret from Vault
   */
  async deleteSecret(path: string): Promise<void> {
    try {
      logger.debug(`Deleting secret from path: ${path}`);

      await this.client.delete(`secret/metadata/${path}`);

      logger.info(`Successfully deleted secret from path: ${path}`);
    } catch (error) {
      logger.error(`Failed to delete secret from path: ${path}`, error);
      throw new Error(`Failed to delete secret from ${path}: ${error.message}`);
    }
  }

  /**
   * List secrets at a given path
   */
  async listSecrets(path: string): Promise<string[]> {
    try {
      logger.debug(`Listing secrets at path: ${path}`);

      const response = await this.client.request({
        method: 'LIST',
        url: `secret/metadata/${path}`,
      });

      const keys = response.data.data.keys || [];
      logger.debug(`Found ${keys.length} secrets at path: ${path}`);
      return keys;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug(`No secrets found at path: ${path}`);
        return [];
      }
      logger.error(`Failed to list secrets at path: ${path}`, error);
      throw new Error(`Failed to list secrets at ${path}: ${error.message}`);
    }
  }

  /**
   * Renew the current token
   */
  async renewToken(): Promise<void> {
    try {
      if (!this.token) {
        throw new Error('No token to renew');
      }

      logger.debug('Renewing Vault token...');

      const response = await this.client.post('auth/token/renew-self');

      const authData = response.data.auth;
      this.token = authData.client_token;

      // Calculate new expiry (with 5 minute buffer)
      const expirySeconds = authData.lease_duration - 300;
      this.tokenExpiry = new Date(Date.now() + (expirySeconds * 1000));

      logger.info('Successfully renewed Vault token', {
        expiresAt: this.tokenExpiry.toISOString(),
      });
    } catch (error) {
      logger.error('Failed to renew Vault token', error);
      // Force re-authentication on next request
      this.token = null;
      this.tokenExpiry = null;
      throw new Error(`Token renewal failed: ${error.message}`);
    }
  }

  /**
   * Check Vault health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.config.address}/v1/sys/health`, {
        timeout: 5000,
      });

      const isHealthy = response.data.initialized && !response.data.sealed;
      logger.debug('Vault health check', { healthy: isHealthy, status: response.data });
      return isHealthy;
    } catch (error) {
      logger.error('Vault health check failed', error);
      return false;
    }
  }

  /**
   * Get database configuration from Vault
   */
  async getDatabaseConfig(): Promise<{
    username: string;
    password: string;
    host: string;
    port: number;
    database: string;
    url: string;
  }> {
    const config = await this.readSecret('database/postgres');
    return {
      username: config.username as string,
      password: config.password as string,
      host: config.host as string,
      port: Number(config.port),
      database: config.database as string,
      url: `postgresql://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`,
    };
  }

  /**
   * Get Redis configuration from Vault
   */
  async getRedisConfig(): Promise<{
    host: string;
    port: number;
    url: string;
  }> {
    const config = await this.readSecret('database/redis');
    return {
      host: config.host as string,
      port: Number(config.port),
      url: config.url as string,
    };
  }

  /**
   * Get JWT configuration from Vault
   */
  async getJWTConfig(): Promise<{
    secret: string;
    algorithm: string;
    expiration: string;
  }> {
    const config = await this.readSecret('jwt/main');
    return {
      secret: config.secret as string,
      algorithm: config.algorithm as string,
      expiration: config.expiration as string,
    };
  }

  /**
   * Get API key from Vault
   */
  async getAPIKey(provider: string, key?: string): Promise<string> {
    const config = await this.readSecret(`api-keys/${provider}`);
    if (key) {
      return config[key] as string;
    }
    return config.api_key as string;
  }

  /**
   * Rotate a secret (for secrets rotation)
   */
  async rotateSecret(path: string, newData: VaultSecret): Promise<void> {
    try {
      logger.info(`Rotating secret at path: ${path}`);

      // Write new version
      await this.writeSecret(path, newData);

      logger.info(`Successfully rotated secret at path: ${path}`);
    } catch (error) {
      logger.error(`Failed to rotate secret at path: ${path}`, error);
      throw error;
    }
  }
}