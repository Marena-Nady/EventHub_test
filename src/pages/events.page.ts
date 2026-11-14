import { type Locator, type Page } from '@playwright/test';

export class EventsPage {
  readonly heading: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', {
      level: 1,
      name: 'Upcoming Events',
    });
  }

  async goto(): Promise<void> {
    await this.page.goto('/events');
  }

  async openEvent(title: string): Promise<void> {
    await this.page.getByRole('link', { name: title, exact: true }).click();
  }
}
