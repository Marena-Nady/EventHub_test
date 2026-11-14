import { type Locator, type Page } from '@playwright/test';
import { BookingForm } from './booking-form.page';

export class EventDetailsPage {
  readonly heading: Locator;
  readonly bookingForm: BookingForm;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1 });
    this.bookingForm = new BookingForm(page);
  }
}
