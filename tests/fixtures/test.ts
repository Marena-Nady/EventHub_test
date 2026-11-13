import { randomUUID } from 'node:crypto';
import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { createAuthenticatedApiContext } from '../../src/auth/api-auth';
import { appConfig, requireTestIdentity, type TestIdentity } from '../../src/config/environment';

export interface CustomerData {
  name: string;
  email: string;
  phone: string;
}

export interface CreatedBookingRegistry {
  track(id: number): void;
}

interface Fixtures {
  testIdentity: TestIdentity;
  authenticatedApi: APIRequestContext;
  authenticatedPage: Page;
  customerData: CustomerData;
  createdBookings: CreatedBookingRegistry;
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

  customerData: async ({}, use) => {
    const id = randomUUID();
    await use({
      name: `EventHub QA ${id.slice(0, 8)}`,
      email: `eventhub.qa.${id}@example.com`,
      phone: '+15550101234',
    });
  },

  createdBookings: async ({ authenticatedApi }, use, testInfo) => {
    const ids = new Set<number>();
    await use({
      track(id) {
        if (!Number.isSafeInteger(id) || id < 1) {
          throw new Error('Only a valid test-created booking ID can be tracked for cleanup.');
        }
        ids.add(id);
      },
    });

    const failures: string[] = [];
    for (const id of ids) {
      try {
        const response = await authenticatedApi.delete(`bookings/${id}`);
        if (![200, 204, 404].includes(response.status())) {
          failures.push(`DELETE /bookings/${id} returned HTTP ${response.status()}.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown request error.';
        failures.push(`DELETE /bookings/${id} failed: ${message}`);
      }
    }

    if (failures.length > 0) {
      await testInfo.attach('booking-cleanup-failures', {
        body: Buffer.from(failures.join('\n')),
        contentType: 'text/plain',
      });
      throw new Error(`Test booking cleanup failed:\n${failures.join('\n')}`);
    }
  },
});

export { expect };
