import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // Common navigation methods
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  // Common element interaction methods
  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  async getText(selector: string): Promise<string> {
    return await this.page.textContent(selector) || '';
  }

  async isVisible(selector: string): Promise<boolean> {
    return await this.page.isVisible(selector);
  }

  async waitForSelector(selector: string, timeout: number = 10000): Promise<Locator> {
    return await this.page.waitForSelector(selector, { timeout });
  }

  // Common assertions
  async expectToBeVisible(selector: string): Promise<void> {
    await expect(this.page.locator(selector)).toBeVisible();
  }

  async expectToHaveText(selector: string, text: string): Promise<void> {
    await expect(this.page.locator(selector)).toHaveText(text);
  }

  async expectToHaveValue(selector: string, value: string): Promise<void> {
    await expect(this.page.locator(selector)).toHaveValue(value);
  }

  // Screenshot helpers
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}-${Date.now()}.png`,
      fullPage: true
    });
  }

  // Wait for API responses
  async waitForApiResponse(urlPattern: string, status: number = 200): Promise<void> {
    await this.page.waitForResponse(response =>
      response.url().includes(urlPattern) && response.status() === status
    );
  }

  // Cookie and storage helpers
  async getCookieValue(name: string): Promise<string | undefined> {
    const cookies = await this.page.context().cookies();
    return cookies.find(cookie => cookie.name === name)?.value;
  }

  async getLocalStorageItem(key: string): Promise<string | null> {
    return await this.page.evaluate(key => localStorage.getItem(key), key);
  }

  async setLocalStorageItem(key: string, value: string): Promise<void> {
    await this.page.evaluate(
      ({ key, value }) => localStorage.setItem(key, value),
      { key, value }
    );
  }
}