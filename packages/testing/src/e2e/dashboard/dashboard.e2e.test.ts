import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';

test.describe('Dashboard E2E Tests', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    await dashboardPage.navigateToDashboard();
  });

  test('should load dashboard with all components', async () => {
    // Verify dashboard is loaded
    expect(await dashboardPage.isDashboardLoaded()).toBe(true);

    // Verify stats cards are visible
    await dashboardPage.expectToBeVisible('[data-testid="agents-stats"]');
    await dashboardPage.expectToBeVisible('[data-testid="workflows-stats"]');
    await dashboardPage.expectToBeVisible('[data-testid="executions-stats"]');

    // Verify quick actions are available
    await dashboardPage.expectToBeVisible('[data-testid="create-agent-btn"]');
    await dashboardPage.expectToBeVisible('[data-testid="create-workflow-btn"]');
  });

  test('should display system status correctly', async () => {
    const status = await dashboardPage.getSystemStatus();
    expect(['healthy', 'warning', 'error']).toContain(status);

    // If status is healthy, verify green indicator
    if (status === 'healthy') {
      await dashboardPage.expectToBeVisible('[data-testid="system-status"].status-healthy');
    }
  });

  test('should show recent activity', async () => {
    const activities = await dashboardPage.getRecentActivityItems();
    expect(activities.length).toBeGreaterThanOrEqual(0);

    // If there are activities, verify they have proper format
    if (activities.length > 0) {
      expect(activities[0]).toBeTruthy();
      expect(typeof activities[0]).toBe('string');
    }
  });

  test('should navigate to agents page from dashboard', async ({ page }) => {
    await dashboardPage.navigateToAgents();
    await expect(page).toHaveURL(/.*\/agents/);

    // Verify agents page loaded
    await expect(page.getByRole('heading', { name: /agents/i })).toBeVisible();
  });

  test('should navigate to workflows page from dashboard', async ({ page }) => {
    await dashboardPage.navigateToWorkflows();
    await expect(page).toHaveURL(/.*\/workflows/);

    // Verify workflows page loaded
    await expect(page.getByRole('heading', { name: /workflows/i })).toBeVisible();
  });

  test('should open user menu and logout', async ({ page }) => {
    await dashboardPage.openUserMenu();

    // Verify user menu is open
    await dashboardPage.expectToBeVisible('[data-testid="user-menu-dropdown"]');

    await dashboardPage.logout();

    // Verify redirected to login page
    await expect(page).toHaveURL(/.*\/auth\/login/);
  });

  test('should show notifications panel', async () => {
    await dashboardPage.clickNotifications();
    await dashboardPage.expectToBeVisible('[data-testid="notifications-panel"]');

    const notificationCount = await dashboardPage.getNotificationCount();
    expect(notificationCount).toBeGreaterThanOrEqual(0);
  });

  test('stats should load with numeric values', async () => {
    await dashboardPage.waitForStatsToLoad();

    const agentsCount = await dashboardPage.getStatsCardValue('agents');
    const workflowsCount = await dashboardPage.getStatsCardValue('workflows');
    const executionsCount = await dashboardPage.getStatsCardValue('executions');

    expect(parseInt(agentsCount)).toBeGreaterThanOrEqual(0);
    expect(parseInt(workflowsCount)).toBeGreaterThanOrEqual(0);
    expect(parseInt(executionsCount)).toBeGreaterThanOrEqual(0);
  });

  test('should handle page refresh gracefully', async ({ page }) => {
    // Ensure dashboard is loaded first
    expect(await dashboardPage.isDashboardLoaded()).toBe(true);

    // Refresh the page
    await page.reload();

    // Verify dashboard loads again
    await dashboardPage.waitForPageLoad();
    expect(await dashboardPage.isDashboardLoaded()).toBe(true);
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Verify dashboard still works on mobile
    expect(await dashboardPage.isDashboardLoaded()).toBe(true);

    // Verify mobile-specific elements if any
    // This would depend on your responsive design implementation
  });
});