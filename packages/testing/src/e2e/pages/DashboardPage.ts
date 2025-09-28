import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
  private readonly selectors = {
    pageTitle: '[data-testid="dashboard-title"]',
    statsCards: '[data-testid="stats-card"]',
    agentsCard: '[data-testid="agents-stats"]',
    workflowsCard: '[data-testid="workflows-stats"]',
    executionsCard: '[data-testid="executions-stats"]',
    recentActivity: '[data-testid="recent-activity"]',
    quickActions: '[data-testid="quick-actions"]',
    createAgentButton: '[data-testid="create-agent-btn"]',
    createWorkflowButton: '[data-testid="create-workflow-btn"]',
    viewAllAgentsLink: '[data-testid="view-all-agents"]',
    viewAllWorkflowsLink: '[data-testid="view-all-workflows"]',
    systemStatus: '[data-testid="system-status"]',
    notificationBell: '[data-testid="notification-bell"]',
    userMenu: '[data-testid="user-menu"]'
  };

  constructor(page: Page) {
    super(page);
  }

  async navigateToDashboard(): Promise<void> {
    await this.goto('/dashboard');
    await this.waitForPageLoad();
    await this.expectToBeVisible(this.selectors.pageTitle);
  }

  async getStatsCardValue(cardType: 'agents' | 'workflows' | 'executions'): Promise<string> {
    const cardSelector = this.selectors[`${cardType}Card`];
    return await this.getText(`${cardSelector} [data-testid="stat-value"]`);
  }

  async clickCreateAgent(): Promise<void> {
    await this.click(this.selectors.createAgentButton);
    await this.waitForApiResponse('/agents', 200);
  }

  async clickCreateWorkflow(): Promise<void> {
    await this.click(this.selectors.createWorkflowButton);
    await this.waitForApiResponse('/workflows', 200);
  }

  async getRecentActivityItems(): Promise<string[]> {
    const activities = await this.page.locator(`${this.selectors.recentActivity} .activity-item`).all();
    const texts: string[] = [];

    for (const activity of activities) {
      const text = await activity.textContent();
      if (text) texts.push(text.trim());
    }

    return texts;
  }

  async getSystemStatus(): Promise<'healthy' | 'warning' | 'error'> {
    const statusElement = await this.page.locator(this.selectors.systemStatus);
    const statusClass = await statusElement.getAttribute('class');

    if (statusClass?.includes('status-healthy')) return 'healthy';
    if (statusClass?.includes('status-warning')) return 'warning';
    if (statusClass?.includes('status-error')) return 'error';

    return 'healthy'; // default
  }

  async openUserMenu(): Promise<void> {
    await this.click(this.selectors.userMenu);
    await this.expectToBeVisible('[data-testid="user-menu-dropdown"]');
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.click('[data-testid="logout-button"]');
    await this.page.waitForURL('**/auth/login');
  }

  async clickNotifications(): Promise<void> {
    await this.click(this.selectors.notificationBell);
    await this.expectToBeVisible('[data-testid="notifications-panel"]');
  }

  async getNotificationCount(): Promise<number> {
    const badge = await this.page.locator(`${this.selectors.notificationBell} .notification-badge`);

    if (await badge.isVisible()) {
      const count = await badge.textContent();
      return parseInt(count || '0', 10);
    }

    return 0;
  }

  async navigateToAgents(): Promise<void> {
    await this.click(this.selectors.viewAllAgentsLink);
    await this.page.waitForURL('**/agents');
  }

  async navigateToWorkflows(): Promise<void> {
    await this.click(this.selectors.viewAllWorkflowsLink);
    await this.page.waitForURL('**/workflows');
  }

  async isDashboardLoaded(): Promise<boolean> {
    try {
      await this.expectToBeVisible(this.selectors.pageTitle);
      await this.expectToBeVisible(this.selectors.statsCards);
      return true;
    } catch {
      return false;
    }
  }

  async waitForStatsToLoad(): Promise<void> {
    // Wait for all stats cards to have numeric values
    await this.page.waitForFunction(() => {
      const statElements = document.querySelectorAll('[data-testid="stat-value"]');
      return Array.from(statElements).every(el => {
        const text = el.textContent?.trim();
        return text && !isNaN(parseInt(text));
      });
    }, { timeout: 10000 });
  }
}