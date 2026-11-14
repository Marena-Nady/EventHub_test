import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';
import { createAuthenticatedApiContext } from '../auth/api-auth';
import { UiAuth } from '../auth/ui-auth';
import { EventHubApi } from '../api/eventhub-api';
import { appConfig, requireTestIdentity, type TestIdentity } from '../config/environment';
import { createCustomerData, createEventInput, type CustomerData } from '../data/test-data';
import type { CreateEventInput } from '../data/contracts';
import { BookingConfirmationPage } from '../pages/booking-confirmation.page';
import { EventDetailsPage } from '../pages/event-details.page';
import { EventsPage } from '../pages/events.page';
import { MyBookingsPage } from '../pages/my-bookings.page';
import { getDataId } from '../support/api-response';

export interface CreatedTestEvent {
  response: APIResponse;
  body: unknown;
  id: number | undefined;
}

export interface ApiTestResources {
  createEvent(overrides?: Partial<CreateEventInput>): Promise<CreatedTestEvent>;
  trackBooking(id: number): void;
}

interface Fixtures {
  testIdentity: TestIdentity;
  authenticatedApi: APIRequestContext;
  authenticatedPage: Page;
  customerData: CustomerData;
  eventHubApi: EventHubApi;
  apiTestResources: ApiTestResources;
  uiAuth: UiAuth;
  eventsPage: EventsPage;
  eventDetailsPage: EventDetailsPage;
  bookingConfirmationPage: BookingConfirmationPage;
  myBookingsPage: MyBookingsPage;
}

export const test = base.extend<Fixtures>({
  testIdentity: async ({}, use) => {
    await use(requireTestIdentity());
  },

  authenticatedApi: async ({ playwright, testIdentity }, use) => {
    const api = await createAuthenticatedApiContext(
      (options) => playwright.request.newContext(options),
      appConfig.apiBaseUrl,
      testIdentity,
    );

    try {
      await use(api);
    } finally {
      await api.dispose();
    }
  },

  uiAuth: async ({ page }, use) => {
    await use(new UiAuth(page));
  },

  authenticatedPage: async ({ page, testIdentity, uiAuth }, use) => {
    await uiAuth.signIn(testIdentity);
    await use(page);
  },

  eventsPage: async ({ authenticatedPage }, use) => {
    await use(new EventsPage(authenticatedPage));
  },

  eventDetailsPage: async ({ authenticatedPage }, use) => {
    await use(new EventDetailsPage(authenticatedPage));
  },

  bookingConfirmationPage: async ({ authenticatedPage }, use) => {
    await use(new BookingConfirmationPage(authenticatedPage));
  },

  myBookingsPage: async ({ authenticatedPage }, use) => {
    await use(new MyBookingsPage(authenticatedPage));
  },

  eventHubApi: async ({ authenticatedApi }, use) => {
    await use(new EventHubApi(authenticatedApi));
  },

  customerData: async ({}, use) => {
    await use(createCustomerData());
  },

  apiTestResources: async ({ eventHubApi }, use, testInfo) => {
    const eventIds = new Set<number>();
    const bookingIds = new Set<number>();

    try {
      await use({
        async createEvent(overrides = {}) {
          const input: CreateEventInput = createEventInput(overrides);
          const response = await eventHubApi.createEvent(input);
          const body: unknown = await response.json();
          const id = getDataId(body);
          if (id !== undefined) eventIds.add(id);
          return { response, body, id };
        },
        trackBooking(id) {
          if (!Number.isSafeInteger(id) || id < 1) {
            throw new Error('Only a valid test-created booking ID can be tracked for cleanup.');
          }
          bookingIds.add(id);
        },
      });
    } finally {
      const failures: string[] = [];

      for (const id of bookingIds) {
        try {
          const response = await eventHubApi.deleteBooking(id);
          if (![200, 204, 404].includes(response.status())) {
            failures.push(`DELETE /bookings/${id} returned HTTP ${response.status()}.`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown request error.';
          failures.push(`DELETE /bookings/${id} failed: ${message}`);
        }
      }

      for (const id of eventIds) {
        try {
          const response = await eventHubApi.deleteEvent(id);
          if (![200, 204, 404].includes(response.status())) {
            failures.push(`DELETE /events/${id} returned HTTP ${response.status()}.`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown request error.';
          failures.push(`DELETE /events/${id} failed: ${message}`);
        }
      }

      if (failures.length > 0) {
        await testInfo.attach('api-test-cleanup-failures', {
          body: Buffer.from(failures.join('\n')),
          contentType: 'text/plain',
        });
        throw new Error(`API test resource cleanup failed:\n${failures.join('\n')}`);
      }
    }
  },
});

export { expect };
