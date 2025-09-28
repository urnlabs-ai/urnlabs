/**
 * Basic Authentication Example
 * Demonstrates login, logout, and token management
 */

import {
  AuthManager,
  createHttpClient,
  createAutoStorage,
  createLogger,
  createErrorHandler
} from '@urnlabs/mobile-sdk-core';

// Setup logging and error handling
const logger = createLogger({
  component: 'AuthExample',
  level: 'info'
});

const errorHandler = createErrorHandler({
  logger,
  enableReporting: false
});

// Create HTTP client
const httpClient = createHttpClient({
  baseURL: 'https://api.urnlabs.com',
  timeout: 30000,
  retryAttempts: 3
});

// Create storage
const storage = createAutoStorage('auth_example_');

// Create auth manager
const authManager = new AuthManager(
  {
    apiUrl: 'https://api.urnlabs.com',
    automaticRefresh: true,
    tokenRefreshThreshold: 300 // 5 minutes
  },
  httpClient,
  storage
);

async function demonstrateAuthentication() {
  try {
    logger.info('Starting authentication demonstration');

    // 1. Check if user is already logged in
    await authManager.restoreAuthState();
    
    if (authManager.isAuthenticated()) {
      const authState = authManager.getAuthState();
      logger.info('User already authenticated', { 
        userId: authState.user?.id,
        username: authState.user?.username 
      });
      return;
    }

    // 2. Login with credentials
    logger.info('Attempting login...');
    
    const loginResult = await authManager.login({
      username: 'demo@urnlabs.com',
      password: 'DemoPassword123!'
    });

    // 3. Handle MFA if required
    if ('challengeId' in loginResult) {
      logger.info('MFA challenge required', { 
        methods: loginResult.availableMethods,
        primary: loginResult.primaryMethod
      });

      // In a real app, you would prompt the user for their MFA code
      const mfaCode = '123456'; // This would come from user input

      const finalResult = await authManager.completeMFALogin({
        method: loginResult.primaryMethod,
        code: mfaCode,
        challengeId: loginResult.challengeId
      });

      logger.info('MFA login completed', { 
        userId: finalResult.user.id,
        username: finalResult.user.username
      });
    } else {
      logger.info('Direct login successful', { 
        userId: loginResult.user.id,
        username: loginResult.user.username
      });
    }

    // 4. Make authenticated requests
    const accessToken = await authManager.getValidAccessToken();
    httpClient.setAuthToken(accessToken);

    logger.info('Making authenticated API call...');
    const userProfile = await httpClient.get('/api/user/profile');
    logger.info('User profile retrieved', { profile: userProfile.data });

    // 5. Demonstrate token refresh
    logger.info('Current token expires at:', new Date(authManager.getAuthState().tokens!.expiresAt));

    // 6. Logout
    logger.info('Logging out...');
    await authManager.logout();
    logger.info('Logout completed');

  } catch (error) {
    const sdkError = errorHandler.handleError(error as Error, {
      component: 'AuthExample',
      operation: 'demonstrateAuthentication'
    });

    logger.error('Authentication demonstration failed', sdkError);
    
    // Handle specific error types
    switch (sdkError.code) {
      case 'AUTH_ERROR':
        console.log('Authentication failed. Please check your credentials.');
        break;
      case 'NETWORK_ERROR':
        console.log('Network error. Please check your connection.');
        break;
      case 'MFA_ERROR':
        console.log('MFA verification failed. Please check your code.');
        break;
      default:
        console.log('An unexpected error occurred.');
    }
  }
}

// Run the demonstration
demonstrateAuthentication().catch(console.error);

export { demonstrateAuthentication };