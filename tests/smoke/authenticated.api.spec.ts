import { test, expect } from '../fixtures/test';

test('authenticated API can read the user and event list', async ({
  authenticatedApi,
}) => {
  const meResponse = await authenticatedApi.get('auth/me');
  expect(meResponse.status()).toBe(200);

  const meBody: unknown = await meResponse.json();
  expect(meBody).toMatchObject({
    success: true,
    user: {
      userId: expect.any(Number),
      email: expect.any(String),
    },
  });

  const eventsResponse = await authenticatedApi.get('events?limit=1&page=1');
  expect(eventsResponse.status()).toBe(200);

  const eventsBody: unknown = await eventsResponse.json();
  expect(eventsBody).toMatchObject({
    success: true,
    data: expect.any(Array),
    pagination: {
      page: 1,
      limit: 1,
    },
  });
});
