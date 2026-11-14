import { type Locator, type Page } from '@playwright/test';

export class MyBookingsPage {
  readonly heading: Locator;
  readonly emptyStateHeading: Locator;
  readonly cancelBookingButtons: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', {
      level: 1,
      name: 'My Bookings',
    });
    this.emptyStateHeading = page.getByRole('heading', {
      name: 'No bookings yet',
    });
    this.cancelBookingButtons = page.getByRole('button', {
      name: 'Cancel Booking',
      exact: true,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto('/bookings');
  }

  bookingCard(reference: string): Locator {
    return this.page.getByText(reference, { exact: false }).first();
  }

  bookingTitle(title: string): Locator {
    return this.page.getByRole('heading', { name: title, exact: true });
  }

  bookingTotal(amount: string): Locator {
    return this.page.getByText(amount, { exact: true });
  }

  async cancelBooking(): Promise<void> {
    await this.cancelBookingButtons.click();
    await this.page
      .getByRole('dialog')
      .getByRole('button', { name: /yes.*cancel/i })
      .click();
  }
}
