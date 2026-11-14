import { type Locator, type Page } from '@playwright/test';

export class BookingConfirmationPage {
  readonly heading: Locator;
  readonly bookingDetails: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', {
      name: /booking confirmed/i,
    });
    this.bookingDetails = page
      .getByText('Booking Ref', { exact: true })
      .locator('..')
      .locator('..');
  }

  totalAmount(amount: string): Locator {
    return this.page.getByText(amount, { exact: true }).first();
  }

  async readBookingDetails(): Promise<string> {
    return (await this.bookingDetails.innerText()).trim();
  }
}
