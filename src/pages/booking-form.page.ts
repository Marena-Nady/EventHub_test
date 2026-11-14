import { type Locator, type Page } from '@playwright/test';
import type { CustomerData } from '../data/test-data';

export class BookingForm {
  readonly decreaseQuantityButton: Locator;
  readonly increaseQuantityButton: Locator;
  readonly confirmBookingButton: Locator;

  constructor(private readonly page: Page) {
    this.decreaseQuantityButton = page.getByRole('button', {
      name: '−',
      exact: true,
    });
    this.increaseQuantityButton = page.getByRole('button', {
      name: '+',
      exact: true,
    });
    this.confirmBookingButton = page.getByRole('button', {
      name: 'Confirm Booking',
      exact: true,
    });
  }

  async increaseQuantityBy(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await this.increaseQuantityButton.click();
    }
  }

  async fillCustomerDetails(customer: CustomerData): Promise<void> {
    await this.page.getByLabel('Full Name*', { exact: true }).fill(customer.name);
    await this.page.getByLabel('Email*', { exact: true }).fill(customer.email);
    await this.page
      .getByLabel('Phone Number*', { exact: true })
      .fill(customer.phone);
  }

  totalAmount(amount: string): Locator {
    return this.page.getByText(amount, { exact: true }).first();
  }

  validationMessage(message: string): Locator {
    return this.page.getByText(message, { exact: true });
  }

  async submitBooking(): Promise<void> {
    await this.confirmBookingButton.click();
  }
}
