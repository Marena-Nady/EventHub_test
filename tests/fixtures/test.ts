import { randomUUID } from 'node:crypto';
import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';
import { createAuthenticatedApiContext } from '../../src/auth/api-auth';
import { appConfig, requireTestIdentity, type TestIdentity } from '../../src/config/environment';
import { EventHubApi } from '../../src/api/eventhub-api';
import type { CreateEventInput } from '../../src/models/contracts';

export interface CustomerData {
  name: string;
  email: string;
  phone: string;
}

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
}

export function getDataId(body: unknown): number | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return undefined;
  }

  const data = (body as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return undefined;
  }

  const id = (data as Record<string, unknown>).id;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0
    ? id
    : undefined;
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

  authenticatedPage: async ({ page, testIdentity }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(testIdentity.email);
    await page.getByLabel('Password', { exact: true }).fill(testIdentity.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(
      page.getByRole('heading', { name: 'Discover & Book Amazing Events' }),
    ).toBeVisible();

    await use(page);
  },

  eventHubApi: async ({ authenticatedApi }, use) => {
    await use(new EventHubApi(authenticatedApi));
  },

  customerData: async ({}, use) => {
    const id = randomUUID();
    await use({
      name: `EventHub QA ${id.slice(0, 8)}`,
      email: `eventhub.qa.${id}@example.com`,
      phone: '+15550101234',
    });
  },

  apiTestResources: async ({ eventHubApi }, use, testInfo) => {
    const eventIds = new Set<number>();
    const bookingIds = new Set<number>();

    try {
      await use({
        async createEvent(overrides = {}) {
          const input: CreateEventInput = {
            title: `EventHub API test ${randomUUID()}`,
            category: 'Workshop',
            venue: 'EventHub QA venue',
            city: 'Testville',
            eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10),
            price: 125,
            totalSeats: 20,
            ...overrides,
          };
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
