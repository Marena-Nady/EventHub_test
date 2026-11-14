import { randomUUID } from 'node:crypto';
import { test, expect } from '../../src/fixtures/test';
import { UiAuth } from '../../src/auth/ui-auth';
import { appConfig } from '../../src/config/environment';
import {
  apiErrorSchema,
  bookingListResponseSchema,
  bookingResponseSchema,
  eventResponseSchema,
  type Booking,
  type CreateBookingInput,
} from '../../src/data/contracts';
import { createCustomerData } from '../../src/data/test-data';
import { MyBookingsPage } from '../../src/pages/my-bookings.page';
import {
  amount,
  bookThroughUiFromApiTest as bookThroughUi,
  createBooking,
  createEvent,
  eventBookings,
  formatCurrency,
  parseApiError,
  readEvent,
  secondTestIdentity,
  submitBooking,
  submitRawBooking,
  withSecondAccountBooking,
} from '../utils/helpers';

test('API_001 - API-created booking appears in My Bookings', async ({
  apiTestResources,
  customerData,
  eventHubApi,
  myBookingsPage,
}) => {
  const event = await createEvent(apiTestResources);
  const booking = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    customerData,
  );

  await myBookingsPage.goto();
  const card = myBookingsPage.bookingCard(booking.bookingRef);
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: event.title })).toBeVisible();
  await expect(card.getByText(/1 ticket/i)).toBeVisible();
  await expect(card.getByText(formatCurrency(booking.totalPrice), { exact: true })).toBeVisible();
});

test('API_002 - UI-created booking can be retrieved through the API', async ({
  apiTestResources,
  bookingConfirmationPage,
  customerData,
  eventDetailsPage,
  eventHubApi,
  eventsPage,
}) => {
  const event = await createEvent(apiTestResources);
  const reference = await bookThroughUi(
    eventsPage,
    eventDetailsPage,
    bookingConfirmationPage,
    event,
    customerData,
  );

  const response = await eventHubApi.getBookingByReference(reference);
  expect(response.status()).toBe(200);
  const booking = bookingResponseSchema.parse(await response.json()).data;
  apiTestResources.trackBooking(booking.id);
  expect(booking).toMatchObject({
    eventId: event.id,
    bookingRef: reference,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 1,
    status: 'confirmed',
  });
  expect(amount(booking.totalPrice)).toBe(amount(event.price));
});

test('API_003 - API deletion is reflected in My Bookings', async ({
  apiTestResources,
  customerData,
  eventHubApi,
  myBookingsPage,
}) => {
  const event = await createEvent(apiTestResources);
  const booking = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    customerData,
  );

  await myBookingsPage.goto();
  await expect(myBookingsPage.bookingCard(booking.bookingRef)).toBeVisible();
  const deleted = await eventHubApi.deleteBooking(booking.id);
  expect([200, 204]).toContain(deleted.status());
  await myBookingsPage.goto();
  await expect(myBookingsPage.bookingCard(booking.bookingRef)).toHaveCount(0);
});

test('API_004 - API booking fields and visible UI details stay consistent', async ({
  apiTestResources,
  customerData,
  eventHubApi,
  myBookingsPage,
}) => {
  const event = await createEvent(apiTestResources, { price: 37.5 });
  const booking = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    customerData,
    2,
  );

  expect(booking).toMatchObject({
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 2,
    status: 'confirmed',
  });
  expect(amount(booking.totalPrice)).toBe(amount(event.price) * 2);

  await myBookingsPage.goto();
  const card = myBookingsPage.bookingCard(booking.bookingRef);
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: event.title })).toBeVisible();
  await expect(card.getByText(/2 tickets/i)).toBeVisible();
  await expect(
    card.getByText(formatCurrency(booking.totalPrice), { exact: true }),
  ).toBeVisible();
});

test('API_005 - POST /bookings creates a booking with the documented result', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources);
  const result = await submitBooking(eventHubApi, apiTestResources, {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 2,
  });

  expect(result.status).toBe(201);
  const booking = bookingResponseSchema.parse(result.body).data;
  expect(booking.eventId).toBe(event.id);
  expect(booking.quantity).toBe(2);
  expect(booking.status).toBe('confirmed');
  expect(amount(booking.totalPrice)).toBe(amount(event.price) * 2);
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(
    event.totalSeats - 2,
  );
});

test('API_006 - booking response contains the required fields and types', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources);
  const result = await submitBooking(eventHubApi, apiTestResources, {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 1,
  });

  expect(result.status).toBe(201);
  const booking = bookingResponseSchema.parse(result.body).data;
  expect(booking).toMatchObject({
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 1,
    status: 'confirmed',
  });
  expect(Number.isInteger(booking.id)).toBe(true);
  expect(booking.bookingRef.length).toBeGreaterThan(0);
  expect(Date.parse(booking.createdAt)).not.toBeNaN();
  expect(Date.parse(booking.updatedAt)).not.toBeNaN();
  expect(booking.event.id).toBe(event.id);
});

test('API_007 - each missing required booking field is rejected', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources);
  const originalSeats = event.availableSeats;
  const requiredFields: Array<keyof CreateBookingInput> = [
    'eventId',
    'customerName',
    'customerEmail',
    'customerPhone',
    'quantity',
  ];

  for (const field of requiredFields) {
    const payload: Partial<CreateBookingInput> = {
      eventId: event.id,
      customerName: customerData.name,
      customerEmail: customerData.email,
      customerPhone: customerData.phone,
      quantity: 1,
    };
    delete payload[field];

    const result = await submitBooking(eventHubApi, apiTestResources, payload);
    expect(result.status, `missing ${field}`).toBe(400);
    expect(parseApiError(result.body).success, `missing ${field}`).toBe(false);
    expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(originalSeats);
  }
});

// Keep this assertion active: accepting invalid JSON value types is tracked as a bug.
test('API_008 - booking endpoint rejects invalid JSON value types', async ({
  apiTestResources,
  authenticatedApi,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources);
  const originalSeats = event.availableSeats;
  const cases: Array<{ field: string; payload: Record<string, unknown> }> = [
    {
      field: 'eventId',
      payload: {
        eventId: 'not-a-number',
        customerName: customerData.name,
        customerEmail: customerData.email,
        customerPhone: customerData.phone,
        quantity: 1,
      },
    },
    {
      field: 'customerName',
      payload: {
        eventId: event.id,
        customerName: 42,
        customerEmail: customerData.email,
        customerPhone: customerData.phone,
        quantity: 1,
      },
    },
    {
      field: 'customerEmail',
      payload: {
        eventId: event.id,
        customerName: customerData.name,
        customerEmail: true,
        customerPhone: customerData.phone,
        quantity: 1,
      },
    },
    {
      field: 'customerPhone',
      payload: {
        eventId: event.id,
        customerName: customerData.name,
        customerEmail: customerData.email,
        customerPhone: 15550101234,
        quantity: 1,
      },
    },
    {
      field: 'quantity',
      payload: {
        eventId: event.id,
        customerName: customerData.name,
        customerEmail: customerData.email,
        customerPhone: customerData.phone,
        quantity: '1',
      },
    },
  ];

  const diagnostics: string[] = [];
  for (const scenario of cases) {
    const seatsBefore = (await readEvent(eventHubApi, event.id)).availableSeats;
    const result = await submitRawBooking(
      authenticatedApi,
      apiTestResources,
      scenario.payload,
    );
    if (result.status !== 400) {
      diagnostics.push(
        `Invalid ${scenario.field} type returned HTTP ${result.status}, expected 400.`,
      );
    } else {
      const error = apiErrorSchema.safeParse(result.body);
      if (!error.success || error.data.success) {
        diagnostics.push(`Invalid ${scenario.field} type returned an invalid error body.`);
      }
    }

    const seatsAfter = (await readEvent(eventHubApi, event.id)).availableSeats;
    if (seatsAfter !== seatsBefore) {
      diagnostics.push(
        `Invalid ${scenario.field} type changed available seats from ${seatsBefore} to ${seatsAfter}.`,
      );
    }
  }
  expect(diagnostics).toEqual([]);
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(originalSeats);
});

test('API_009 - booking with a nonexistent event ID returns not found', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const result = await submitBooking(eventHubApi, apiTestResources, {
    eventId: Number.MAX_SAFE_INTEGER,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 1,
  });

  expect(result.status).toBe(404);
  expect(parseApiError(result.body).success).toBe(false);
});

test('API_010 - zero ticket quantity is rejected without changing seats', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources);
  const result = await submitBooking(eventHubApi, apiTestResources, {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 0,
  });

  expect(result.status).toBe(400);
  expect(parseApiError(result.body).success).toBe(false);
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(
    event.availableSeats,
  );
});

test('API_011 - negative ticket quantity is rejected without changing seats', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources);
  const result = await submitBooking(eventHubApi, apiTestResources, {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: -1,
  });

  expect(result.status).toBe(400);
  expect(parseApiError(result.body).success).toBe(false);
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(
    event.availableSeats,
  );
});

test('API_012 - insufficient seats reject a booking without side effects', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources, { totalSeats: 1 });
  const result = await submitBooking(eventHubApi, apiTestResources, {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 2,
  });

  expect(result.status).toBe(400);
  expect(parseApiError(result.body).error).toMatch(/seat/i);
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(1);
  expect(await eventBookings(eventHubApi, apiTestResources, event.id)).toHaveLength(0);
});

test('API_013 - anonymous callers cannot retrieve a private test event', async ({
  apiTestResources,
  customerData,
  eventHubApi,
  request,
}) => {
  const event = await createEvent(apiTestResources);
  const response = await request.get(
    `${appConfig.apiBaseUrl}/events/${event.id}`,
  );

  expect([401, 403, 404]).toContain(response.status());
  expect(parseApiError(await response.json()).success).toBe(false);
});

test('API_014 - a different account cannot read another account booking', async ({
  eventHubApi,
  playwright,
}) => {
  const identity = secondTestIdentity();
  if (!identity) {
    test.skip(
      true,
      'Requires provisioned Account B credentials in TEST_USER_EMAIL_B and TEST_USER_PASSWORD_B.',
    );
    return;
  }

  await withSecondAccountBooking(
    identity,
    (options) => playwright.request.newContext(options),
    async (_accountBApi, _event, booking) => {
      const response = await eventHubApi.getBooking(booking.id);
      expect([403, 404]).toContain(response.status());
      expect(parseApiError(await response.json()).success).toBe(false);
    },
  );
});

test('API_015 - another account My Bookings page hides this account bookings', async ({
  apiTestResources,
  browser,
  customerData,
  eventHubApi,
}) => {
  const identity = secondTestIdentity();
  if (!identity) {
    test.skip(
      true,
      'Requires provisioned Account B credentials in TEST_USER_EMAIL_B and TEST_USER_PASSWORD_B.',
    );
    return;
  }

  const event = await createEvent(apiTestResources);
  const booking = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    customerData,
  );
  const context = await browser.newContext({ baseURL: appConfig.webBaseUrl });

  try {
    const page = await context.newPage();
    await new UiAuth(page).signIn(identity);
    const accountBBookings = new MyBookingsPage(page);
    await accountBBookings.goto();
    await expect(accountBBookings.bookingCard(booking.bookingRef)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('API_016 - stale booking requests fail after another request consumes the seat', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources, { totalSeats: 1 });
  const stalePayload: CreateBookingInput = {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 1,
  };
  const competingCustomer = createCustomerData();
  const winner = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    competingCustomer,
  );

  const staleResult = await submitBooking(
    eventHubApi,
    apiTestResources,
    stalePayload,
  );
  expect(staleResult.status).toBe(400);
  expect(parseApiError(staleResult.body).error).toMatch(/seat/i);
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(0);
  const bookings = await eventBookings(eventHubApi, apiTestResources, event.id);
  expect(bookings).toHaveLength(1);
  expect(bookings[0].id).toBe(winner.id);
});

test('API_017 - simultaneous last-seat requests create exactly one booking', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources, { totalSeats: 1 });
  const competingCustomer = createCustomerData();
  const results = await Promise.all([
    submitBooking(eventHubApi, apiTestResources, {
      eventId: event.id,
      customerName: customerData.name,
      customerEmail: customerData.email,
      customerPhone: customerData.phone,
      quantity: 1,
    }),
    submitBooking(eventHubApi, apiTestResources, {
      eventId: event.id,
      customerName: competingCustomer.name,
      customerEmail: competingCustomer.email,
      customerPhone: competingCustomer.phone,
      quantity: 1,
    }),
  ]);
  const statuses = results.map((result) => result.status);

  expect(statuses.filter((status) => status === 201)).toHaveLength(1);
  expect(statuses.filter((status) => status === 400)).toHaveLength(1);
  for (const result of results.filter((item) => item.status === 400)) {
    expect(parseApiError(result.body).success).toBe(false);
  }
  const bookings = await eventBookings(eventHubApi, apiTestResources, event.id);
  expect(bookings).toHaveLength(1);
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(0);
});

// API_018 could not be tested due to unprovided test data for a past event.
/*
test('API_018 - booking a past event is rejected', async () => {
  test.fixme(
    true,
    'The API rejects creation of an isolated past-dated event, so this booking rule cannot be tested safely without seeded data or a server-time test fixture.',
  );
});
*/

test('API_019 - lookup by a nonexistent booking reference returns not found', async ({
  eventHubApi,
}) => {
  const reference = `EVT-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  const response = await eventHubApi.getBookingByReference(reference);

  expect(response.status()).toBe(404);
  expect(parseApiError(await response.json()).success).toBe(false);
});

test('API_020 - lookup by a valid booking reference returns its booking', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources);
  const created = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    customerData,
  );
  const response = await eventHubApi.getBookingByReference(created.bookingRef);

  expect(response.status()).toBe(200);
  expect(bookingResponseSchema.parse(await response.json()).data).toMatchObject({
    id: created.id,
    eventId: event.id,
    bookingRef: created.bookingRef,
  });
});

test('API_021 - deleting a booking removes it from the API and My Bookings', async ({
  apiTestResources,
  customerData,
  eventHubApi,
  myBookingsPage,
}) => {
  test.info().annotations.push({
    type: 'contract-discrepancy',
    description:
      'The spreadsheet expects a retained cancelled record; the documented DELETE contract permanently deletes bookings.',
  });
  const event = await createEvent(apiTestResources);
  const booking = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    customerData,
  );
  const deleted = await eventHubApi.deleteBooking(booking.id);

  expect([200, 204]).toContain(deleted.status());
  const retainedBookingResponse = await eventHubApi.getBooking(booking.id);
  expect.soft(retainedBookingResponse.status()).toBe(200);
  if (retainedBookingResponse.status() === 200) {
    const retainedBooking = bookingResponseSchema.parse(
      await retainedBookingResponse.json(),
    ).data;
    expect.soft(retainedBooking.status).toBe('cancelled');
  }

  await myBookingsPage.goto();
  const bookingCard = myBookingsPage.bookingCard(booking.bookingRef);
  await expect.soft(bookingCard).toBeVisible();
  if (await bookingCard.count() > 0) {
    await expect.soft(bookingCard.getByText(/cancelled/i)).toBeVisible();
  }
});

test('API_022 - a deleted booking cannot be deleted a second time', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources);
  const booking = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    customerData,
  );
  const firstDelete = await eventHubApi.deleteBooking(booking.id);
  expect([200, 204]).toContain(firstDelete.status());

  const secondDelete = await eventHubApi.deleteBooking(booking.id);
  expect(secondDelete.status()).toBe(404);
  expect(parseApiError(await secondDelete.json()).success).toBe(false);
});

test('API_023 - a new booking can use seats restored by deleting an earlier booking', async ({
  apiTestResources,
  customerData,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources, { totalSeats: 1 });
  const firstBooking = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    customerData,
  );
  const deleted = await eventHubApi.deleteBooking(firstBooking.id);
  expect([200, 204]).toContain(deleted.status());
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(1);

  const nextCustomer = createCustomerData();
  const nextBooking = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    nextCustomer,
  );
  expect(nextBooking.id).not.toBe(firstBooking.id);
  expect(nextBooking.bookingRef).not.toBe(firstBooking.bookingRef);
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(0);
});

test('API_024 - deleting a nonexistent booking ID returns not found', async ({
  eventHubApi,
}) => {
  const response = await eventHubApi.deleteBooking(Number.MAX_SAFE_INTEGER);

  expect(response.status()).toBe(404);
  expect(parseApiError(await response.json()).success).toBe(false);
});

test('API_025 - cancelling all bookings retains them with cancelled status', async ({
  apiTestResources,
  eventHubApi,
  myBookingsPage,
}) => {
  test.info().annotations.push({
    type: 'contract-discrepancy',
    description:
      'The spreadsheet says all bookings are cancelled; the documented DELETE operation permanently removes them.',
  });
  const event = await createEvent(apiTestResources, { totalSeats: 2 });
  const first = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    createCustomerData(),
  );
  const second = await createBooking(
    eventHubApi,
    apiTestResources,
    event,
    createCustomerData(),
  );

  for (const booking of [first, second]) {
    const deleted = await eventHubApi.deleteBooking(booking.id);
    expect([200, 204]).toContain(deleted.status());
    const retained = await eventHubApi.getBooking(booking.id);
    expect.soft(retained.status()).toBe(200);
    if (retained.status() === 200) {
      expect.soft(bookingResponseSchema.parse(await retained.json()).data.status)
        .toBe('cancelled');
    }
  }

  const cancelledBookings = await eventBookings(
    eventHubApi,
    apiTestResources,
    event.id,
    'cancelled',
  );
  expect.soft(cancelledBookings.map((booking) => booking.id).sort()).toEqual(
    [first.id, second.id].sort(),
  );
  await myBookingsPage.goto();
  for (const booking of [first, second]) {
    const bookingCard = myBookingsPage.bookingCard(booking.bookingRef);
    await expect.soft(bookingCard).toBeVisible();
    if (await bookingCard.count() > 0) {
      await expect.soft(bookingCard.getByText(/cancelled/i)).toBeVisible();
    }
  }
});

// API_026 could not be tested due to unprovided test data for an event that has started.
/*
test('API_026 - cancellation is rejected after the event starts', async () => {
  test.fixme(
    true,
    'The API rejects past-dated event creation and the contract has no server-time fixture for constructing a started event.',
  );
});
*/

// API_027 could not be tested due to unprovided test data for an event that has ended.
/*
test('API_027 - cancellation is rejected after the event ends', async () => {
  test.fixme(
    true,
    'The API rejects past-dated event creation and the contract has no server-time fixture for constructing an ended event.',
  );
});
*/

test('API_028 - Account A cannot delete an Account B booking', async ({
  eventHubApi,
  playwright,
}) => {
  const identity = secondTestIdentity();
  if (!identity) {
    test.skip(
      true,
      'Requires provisioned Account B credentials in TEST_USER_EMAIL_B and TEST_USER_PASSWORD_B.',
    );
    return;
  }

  await withSecondAccountBooking(
    identity,
    (options) => playwright.request.newContext(options),
    async (accountBApi, _event, booking) => {
      const attemptedDelete = await eventHubApi.deleteBooking(booking.id);
      expect([403, 404]).toContain(attemptedDelete.status());
      expect((await accountBApi.getBooking(booking.id)).status()).toBe(200);
    },
  );
});

test('API_029 - booking lists filter correctly by event ID', async ({
  apiTestResources,
  eventHubApi,
}) => {
  const firstEvent = await createEvent(apiTestResources, { totalSeats: 1 });
  const secondEvent = await createEvent(apiTestResources, { totalSeats: 1 });
  const firstBooking = await createBooking(
    eventHubApi,
    apiTestResources,
    firstEvent,
    createCustomerData(),
  );
  const secondBooking = await createBooking(
    eventHubApi,
    apiTestResources,
    secondEvent,
    createCustomerData(),
  );

  const firstList = await eventHubApi.listBookings({
    eventId: firstEvent.id,
    page: 1,
    limit: 100,
  });
  const secondList = await eventHubApi.listBookings({
    eventId: secondEvent.id,
    page: 1,
    limit: 100,
  });
  expect(firstList.status()).toBe(200);
  expect(secondList.status()).toBe(200);
  const firstBookings = bookingListResponseSchema.parse(await firstList.json()).data;
  const secondBookings = bookingListResponseSchema.parse(await secondList.json()).data;
  expect(firstBookings.map((booking) => booking.id)).toEqual([firstBooking.id]);
  expect(secondBookings.map((booking) => booking.id)).toEqual([secondBooking.id]);
});

test('API_030 - booking list pagination returns consistent pages and metadata', async ({
  apiTestResources,
  eventHubApi,
}) => {
  const event = await createEvent(apiTestResources, { totalSeats: 3 });
  const created: Booking[] = [];
  for (let index = 0; index < 3; index += 1) {
    created.push(
      await createBooking(
        eventHubApi,
        apiTestResources,
        event,
        createCustomerData(),
      ),
    );
  }

  const firstPageResponse = await eventHubApi.listBookings({
    eventId: event.id,
    page: 1,
    limit: 2,
  });
  const secondPageResponse = await eventHubApi.listBookings({
    eventId: event.id,
    page: 2,
    limit: 2,
  });
  expect(firstPageResponse.status()).toBe(200);
  expect(secondPageResponse.status()).toBe(200);
  const firstPage = bookingListResponseSchema.parse(
    await firstPageResponse.json(),
  );
  const secondPage = bookingListResponseSchema.parse(
    await secondPageResponse.json(),
  );

  expect(firstPage.pagination).toMatchObject({
    total: 3,
    page: 1,
    limit: 2,
    totalPages: 2,
  });
  expect(secondPage.pagination).toMatchObject({
    total: 3,
    page: 2,
    limit: 2,
    totalPages: 2,
  });
  expect(firstPage.data).toHaveLength(2);
  expect(secondPage.data).toHaveLength(1);
  const pagedIds = [...firstPage.data, ...secondPage.data]
    .map((booking) => booking.id)
    .sort((left, right) => left - right);
  expect(pagedIds).toEqual(created.map((booking) => booking.id).sort((a, b) => a - b));
});
