import { chromium, FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test environment setup...');

  // Ensure test results directory exists
  const authDir = path.join(__dirname, '../../test-results/auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Navigate to the application
    const baseURL = config.projects[0].use?.baseURL || 'http://localhost:7000';

    // Wait for health check to ensure services are ready
    await page.goto(`${baseURL}/health`);
    await page.waitForResponse(response =>
      response.url().includes('/health') && response.status() === 200,
      { timeout: 30000 }
    );

    console.log('✅ Application health check passed');

    // Set up test user authentication
    await page.goto(`${baseURL}/auth/login`);

    // Fill in test credentials
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'testpassword123');
    await page.click('[data-testid="login-button"]');

    // Wait for successful login redirect
    await page.waitForURL('**/dashboard', { timeout: 10000 });

    console.log('✅ Test user authentication setup complete');

    // Save authentication state
    await page.context().storageState({
      path: path.join(authDir, 'user.json')
    });

    console.log('✅ Authentication state saved');

    // Set up admin user authentication
    const adminPage = await browser.newPage();
    await adminPage.goto(`${baseURL}/auth/login`);

    await adminPage.fill('[data-testid="email-input"]', 'admin@example.com');
    await adminPage.fill('[data-testid="password-input"]', 'adminpassword123');
    await adminPage.click('[data-testid="login-button"]');

    await adminPage.waitForURL('**/dashboard', { timeout: 10000 });

    await adminPage.context().storageState({
      path: path.join(authDir, 'admin.json')
    });

    console.log('✅ Admin authentication state saved');

    await adminPage.close();

  } catch (error) {
    console.error('❌ Global setup failed:', error);

    // Take screenshot for debugging
    await page.screenshot({
      path: path.join(__dirname, '../../test-results/setup-failure.png'),
      fullPage: true
    });

    throw error;
  } finally {
    await browser.close();
  }

  console.log('🎉 E2E test environment setup completed successfully');
}

export default globalSetup;