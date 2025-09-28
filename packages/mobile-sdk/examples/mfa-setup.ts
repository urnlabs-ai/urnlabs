/**
 * Multi-Factor Authentication Setup Example
 * Demonstrates TOTP and SMS MFA setup and management
 */

import {
  AuthManager,
  MFAManager,
  createHttpClient,
  createAutoStorage,
  createLogger,
  MFAMethod
} from '@urnlabs/mobile-sdk-core';

const logger = createLogger({
  component: 'MFAExample',
  level: 'info'
});

// Setup (assuming user is already authenticated)
const httpClient = createHttpClient({
  baseURL: 'https://api.urnlabs.com',
  timeout: 30000
});

const storage = createAutoStorage('mfa_example_');

const authManager = new AuthManager(
  { apiUrl: 'https://api.urnlabs.com' },
  httpClient,
  storage
);

async function demonstrateMFASetup() {
  try {
    // Get MFA manager
    const mfaManager = authManager.getMFAManager();

    logger.info('Starting MFA setup demonstration');

    // 1. Check current MFA status
    const currentStatus = await mfaManager.getMFAStatus();
    logger.info('Current MFA status', currentStatus);

    // 2. Setup TOTP MFA
    if (!currentStatus.enabledMethods.includes('totp')) {
      logger.info('Setting up TOTP MFA...');
      
      const totpSetup = await mfaManager.setupMFA({
        method: 'totp'
      });

      console.log('📱 TOTP Setup Instructions:');
      console.log('1. Open your authenticator app (Google Authenticator, Authy, etc.)');
      console.log('2. Scan this QR code:');
      console.log(totpSetup.qrCode);
      console.log('3. Or manually enter this secret:');
      console.log(totpSetup.secret);

      // In a real app, you would wait for user to scan QR code and enter the code
      const userTotpCode = '123456'; // This would come from user input

      // Verify TOTP setup
      const totpVerification = await mfaManager.verifyMFASetup({
        method: 'totp',
        code: userTotpCode,
        setupToken: totpSetup.setupToken
      });

      if (totpVerification.success) {
        logger.info('TOTP MFA setup completed successfully');
      } else {
        logger.error('TOTP MFA setup verification failed');
        return;
      }
    }

    // 3. Setup SMS MFA
    if (!currentStatus.enabledMethods.includes('sms')) {
      logger.info('Setting up SMS MFA...');
      
      const smsSetup = await mfaManager.setupMFA({
        method: 'sms',
        phoneNumber: '+1234567890' // This would come from user input
      });

      console.log('📱 SMS Setup:');
      console.log('A verification code has been sent to your phone.');

      // In a real app, you would wait for user to receive and enter the SMS code
      const userSmsCode = '123456'; // This would come from user input

      // Verify SMS setup
      const smsVerification = await mfaManager.verifyMFASetup({
        method: 'sms',
        code: userSmsCode,
        setupToken: smsSetup.setupToken
      });

      if (smsVerification.success) {
        logger.info('SMS MFA setup completed successfully');
      } else {
        logger.error('SMS MFA setup verification failed');
        return;
      }
    }

    // 4. Generate backup codes
    logger.info('Generating backup codes...');
    
    // User needs to provide current MFA code to generate backup codes
    const currentMfaCode = '123456'; // This would come from user input
    const backupCodes = await mfaManager.generateBackupCodes(currentMfaCode);

    console.log('🔐 Backup Codes (save these in a secure location):');
    backupCodes.forEach((code, index) => {
      console.log(`${index + 1}. ${code}`);
    });

    // 5. Check final MFA status
    const finalStatus = await mfaManager.getMFAStatus();
    logger.info('Final MFA status', finalStatus);

    // 6. Demonstrate MFA validation
    demonstrateMFAValidation(mfaManager);

  } catch (error) {
    logger.error('MFA setup demonstration failed', error as Error);
  }
}

async function demonstrateMFAValidation(mfaManager: MFAManager) {
  logger.info('Demonstrating MFA code validation...');

  const testCases = [
    { method: 'totp' as MFAMethod, code: '123456', expected: true },
    { method: 'totp' as MFAMethod, code: '12345', expected: false }, // Wrong length
    { method: 'totp' as MFAMethod, code: '12345a', expected: false }, // Invalid characters
    { method: 'sms' as MFAMethod, code: '654321', expected: true },
    { method: 'backup_codes' as MFAMethod, code: 'ABCD1234', expected: true },
    { method: 'backup_codes' as MFAMethod, code: 'abc', expected: false }, // Too short
  ];

  testCases.forEach(testCase => {
    const validation = mfaManager.validateMFACode(testCase.code, testCase.method);
    const result = validation.isValid === testCase.expected ? '✅' : '❌';
    
    console.log(`${result} ${testCase.method}: "${testCase.code}" - ${validation.isValid ? 'Valid' : validation.error}`);
  });
}

async function demonstrateMFALogin() {
  try {
    logger.info('Demonstrating MFA login flow...');

    // 1. Initiate login (this would typically be called from the auth manager)
    const mfaManager = authManager.getMFAManager();
    
    const challengeResponse = await mfaManager.initiateMFAChallenge({
      username: 'demo@urnlabs.com',
      password: 'DemoPassword123!',
      preferredMethod: 'totp'
    });

    logger.info('MFA challenge initiated', {
      challengeId: challengeResponse.challengeId,
      availableMethods: challengeResponse.availableMethods,
      primaryMethod: challengeResponse.primaryMethod
    });

    // 2. User enters MFA code
    const userMfaCode = '123456'; // This would come from user input

    // 3. Verify MFA challenge
    const verificationResult = await mfaManager.verifyMFAChallenge({
      method: challengeResponse.primaryMethod,
      code: userMfaCode,
      challengeId: challengeResponse.challengeId
    });

    if (verificationResult.success) {
      logger.info('MFA login verification successful');
    } else {
      logger.warn('MFA login verification failed', {
        remainingAttempts: verificationResult.remainingAttempts,
        nextMethod: verificationResult.nextMethod
      });

      // If failed, user could try again or use a different method
      if (verificationResult.nextMethod) {
        console.log(`Try using ${verificationResult.nextMethod} instead.`);
      }
    }

  } catch (error) {
    logger.error('MFA login demonstration failed', error as Error);
  }
}

async function demonstrateMFAManagement() {
  try {
    const mfaManager = authManager.getMFAManager();
    
    logger.info('Demonstrating MFA management features...');

    // 1. Resend SMS code (if SMS method is set up)
    try {
      await mfaManager.resendMFACode('sms');
      logger.info('SMS code resent successfully');
    } catch (error) {
      logger.warn('SMS resend failed (method may not be active)', error as Error);
    }

    // 2. Check supported methods
    const supportedMethods = mfaManager.getSupportedMethods();
    logger.info('Supported MFA methods', supportedMethods);

    // 3. Check if specific methods are supported
    console.log('Method support:');
    ['totp', 'sms', 'email', 'push', 'backup_codes'].forEach(method => {
      const isSupported = mfaManager.isMethodSupported(method as MFAMethod);
      console.log(`  ${method}: ${isSupported ? '✅' : '❌'}`);
    });

    // 4. Disable MFA (requires current MFA code)
    // Note: This is commented out to avoid actually disabling MFA
    /*
    const currentMfaCode = '123456'; // This would come from user input
    await mfaManager.disableMFA('totp', currentMfaCode);
    logger.info('TOTP MFA disabled');
    */

  } catch (error) {
    logger.error('MFA management demonstration failed', error as Error);
  }
}

// Export functions for use in other examples
export {
  demonstrateMFASetup,
  demonstrateMFALogin,
  demonstrateMFAManagement
};

// Run demonstrations
if (require.main === module) {
  (async () => {
    await demonstrateMFASetup();
    await demonstrateMFALogin();
    await demonstrateMFAManagement();
  })().catch(console.error);
}