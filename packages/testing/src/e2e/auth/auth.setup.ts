import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../../../test-results/auth/user.json');

setup('authenticate user', async ({ page }) => {
  // Perform authentication steps
  await page.goto('/auth/login');

  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'testpassword123');
  await page.click('[data-testid="login-button"]');

  // Wait until the page redirects to dashboard
  await page.waitForURL('**/dashboard');

  // Alternatively, you can wait until the page reaches a state where all cookies are set
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // End of authentication steps
  await page.context().storageState({ path: authFile });
});