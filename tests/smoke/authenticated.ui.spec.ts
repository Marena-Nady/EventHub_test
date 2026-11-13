import { test, expect } from '../fixtures/test';

test('authenticated user can browse events', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/events');

  await expect(
    authenticatedPage.getByRole('heading', { name: 'Upcoming Events' }),
  ).toBeVisible();
  await expect(authenticatedPage.getByRole('article').first()).toBeVisible();
});
