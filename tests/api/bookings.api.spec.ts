import { test, expect } from '../../src/fixtures/test';
import type { ApiTestResources } from '../../src/fixtures/test';
import { getDataId } from '../../src/support/api-response';
import type { EventHubApi } from '../../src/api/eventhub-api';
import type { CreateBookingInput } from '../../src/data/contracts';
import {
  apiErrorSchema,
  bookingListResponseSchema,
  bookingResponseSchema,
  eventResponseSchema,
} from '../../src/data/contracts';

const documentedBookingReference = /^EVT-[A-Z0-9]{6}$/;

function parseCreatedEvent(
  created: Awaited<ReturnType<ApiTestResources['createEvent']>>,
) {
  expect(created.response.status()).toBe(201);
  const parsed = eventResponseSchema.parse(created.body);
  if (created.id === undefined) {
    throw new Error('Created event response did not contain a numeric data.id for cleanup.');
  }
  expect(parsed.data.id).toBe(created.id);
  return parsed.data;
}

async function submitBooking(
  api: EventHubApi,
  resources: ApiTestResources,
  input: Partial<CreateBookingInput>,
): Promise<{ response: Awaited<ReturnType<EventHubApi['createBooking']>>; body: unknown }> {
  const response = await api.createBooking(input);
  const body: unknown = await response.json();
  const id = getDataId(body);
  if (id !== undefined) resources.trackBooking(id);
  return { response, body };
}

function parseApiError(body: unknown) {
  const parsed = apiErrorSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`API error response did not match its contract: ${issues}`);
  }
  return parsed.data;
}

async function readEvent(api: EventHubApi, id: number) {
  const response = await api.getEvent(id);
  expect(response.status()).toBe(200);
  return eventResponseSchema.parse(await response.json()).data;
}

function amount(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a numeric price, received ${String(value)}.`);
  }
  return parsed;
}

test('creates a booking with correct total and supports ID, reference, and list lookups', async ({
  apiTestResources,
  eventHubApi,
  customerData,
}) => {
  const event = parseCreatedEvent(await apiTestResources.createEvent());
  const created = await submitBooking(eventHubApi, apiTestResources, {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 1,
  });

  expect(created.response.status()).toBe(201);
  const booking = bookingResponseSchema.parse(created.body).data;
  expect(booking).toMatchObject({
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 1,
    status: 'confirmed',
  });
  expect(amount(booking.totalPrice)).toBe(amount(event.price));
  expect(booking.bookingRef).toBeTruthy();

  const byId = await eventHubApi.getBooking(booking.id);
  expect(byId.status()).toBe(200);
  expect(bookingResponseSchema.parse(await byId.json()).data.id).toBe(booking.id);

  const byReference = await eventHubApi.getBookingByReference(booking.bookingRef);
  expect(byReference.status()).toBe(200);
  expect(bookingResponseSchema.parse(await byReference.json()).data.id).toBe(booking.id);

  const listed = await eventHubApi.listBookings({
    eventId: event.id,
    status: 'confirmed',
    page: 1,
    limit: 100,
  });
  expect(listed.status()).toBe(200);
  const bookings = bookingListResponseSchema.parse(await listed.json()).data;
  expect(bookings.some((item) => item.id === booking.id)).toBe(true);

  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(
    event.availableSeats - 1,
  );
});

test('accepts the maximum quantity and calculates its total', async ({
  apiTestResources,
  eventHubApi,
  customerData,
}) => {
  const event = parseCreatedEvent(
    await apiTestResources.createEvent({ totalSeats: 10 }),
  );
  const created = await submitBooking(eventHubApi, apiTestResources, {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 10,
  });

  expect(created.response.status()).toBe(201);
  const booking = bookingResponseSchema.parse(created.body).data;
  expect(booking.quantity).toBe(10);
  expect(amount(booking.totalPrice)).toBe(amount(event.price) * 10);
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(0);
});

test('rejects invalid booking fields and leaves event seats unchanged', async ({
  apiTestResources,
  eventHubApi,
  customerData,
}) => {
  const event = parseCreatedEvent(await apiTestResources.createEvent());
  const originalSeats = event.availableSeats;
  const cases: Array<{
    name: string;
    expectedField: string;
    missingField?: keyof CreateBookingInput;
    overrides?: Partial<CreateBookingInput>;
  }> = [
    { name: 'missing event ID', expectedField: 'eventId', missingField: 'eventId' },
    {
      name: 'missing customer name',
      expectedField: 'customerName',
      missingField: 'customerName',
    },
    {
      name: 'missing quantity',
      expectedField: 'quantity',
      missingField: 'quantity',
    },
    {
      name: 'invalid email',
      expectedField: 'customerEmail',
      overrides: { customerEmail: 'not-an-email' },
    },
    {
      name: 'name shorter than two characters',
      expectedField: 'customerName',
      overrides: { customerName: 'A' },
    },
    {
      name: 'phone shorter than ten characters',
      expectedField: 'customerPhone',
      overrides: { customerPhone: '123456789' },
    },
    {
      name: 'quantity below the minimum',
      expectedField: 'quantity',
      overrides: { quantity: 0 },
    },
    {
      name: 'quantity above the maximum',
      expectedField: 'quantity',
      overrides: { quantity: 11 },
    },
    {
      name: 'fractional quantity',
      expectedField: 'quantity',
      overrides: { quantity: 1.5 },
    },
  ];

  for (const scenario of cases) {
    const payload: Partial<CreateBookingInput> = {
      eventId: event.id,
      customerName: customerData.name,
      customerEmail: customerData.email,
      customerPhone: customerData.phone,
      quantity: 1,
      ...scenario.overrides,
    };
    if (scenario.missingField) delete payload[scenario.missingField];

    const result = await submitBooking(eventHubApi, apiTestResources, payload);
    expect(result.response.status(), scenario.name).toBe(400);

    const error = parseApiError(result.body);
    expect(
      error.details?.some((detail) => detail.field === scenario.expectedField),
      scenario.name,
    ).toBe(true);
    expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(originalSeats);
  }
});

test('rejects a booking larger than the owned event capacity without side effects', async ({
  apiTestResources,
  eventHubApi,
  customerData,
}) => {
  const event = parseCreatedEvent(
    await apiTestResources.createEvent({ totalSeats: 1 }),
  );
  const result = await submitBooking(eventHubApi, apiTestResources, {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 2,
  });

  expect(result.response.status()).toBe(400);
  expect(parseApiError(result.body).error).toMatch(/seat/i);
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(1);

  const list = await eventHubApi.listBookings({ eventId: event.id, status: 'confirmed' });
  expect(list.status()).toBe(200);
  expect(bookingListResponseSchema.parse(await list.json()).data).toHaveLength(0);
});

test('returns not found when booking against an event deleted by the same test', async ({
  apiTestResources,
  eventHubApi,
  customerData,
}) => {
  const event = parseCreatedEvent(await apiTestResources.createEvent());
  const deletedEvent = await eventHubApi.deleteEvent(event.id);
  expect([200, 204]).toContain(deletedEvent.status());

  const result = await submitBooking(eventHubApi, apiTestResources, {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 1,
  });
  expect(result.response.status()).toBe(404);
  expect(parseApiError(result.body).success).toBe(false);
});

test('deleting a booking removes it and restores the event seats', async ({
  apiTestResources,
  eventHubApi,
  customerData,
}) => {
  const event = parseCreatedEvent(
    await apiTestResources.createEvent({ price: 80, totalSeats: 5 }),
  );
  const created = await submitBooking(eventHubApi, apiTestResources, {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 2,
  });
  expect(created.response.status()).toBe(201);
  const booking = bookingResponseSchema.parse(created.body).data;
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(3);

  const deleted = await eventHubApi.deleteBooking(booking.id);
  expect(deleted.status()).toBe(200);
  expect(await deleted.json()).toMatchObject({ success: true });

  const byId = await eventHubApi.getBooking(booking.id);
  expect(byId.status()).toBe(404);
  parseApiError(await byId.json());
  const byReference = await eventHubApi.getBookingByReference(booking.bookingRef);
  expect(byReference.status()).toBe(404);
  parseApiError(await byReference.json());

  const listed = await eventHubApi.listBookings({
    eventId: event.id,
    status: 'confirmed',
  });
  expect(listed.status()).toBe(200);
  expect(bookingListResponseSchema.parse(await listed.json()).data).toHaveLength(0);
  expect((await readEvent(eventHubApi, event.id)).availableSeats).toBe(5);
});

test('booking reference follows the documented EVT-XXXXXX format', async ({
  apiTestResources,
  eventHubApi,
  customerData,
}) => {
  const event = parseCreatedEvent(await apiTestResources.createEvent());
  const created = await submitBooking(eventHubApi, apiTestResources, {
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    quantity: 1,
  });
  expect(created.response.status()).toBe(201);
  const booking = bookingResponseSchema.parse(created.body).data;
  const matchesContract = documentedBookingReference.test(booking.bookingRef);

  if (!matchesContract) {
    test.info().annotations.push({
      type: 'contract-discrepancy',
      description: 'P1-D3: Swagger specifies EVT-XXXXXX; Phase 1 observed D-XXXXXX.',
    });
  }
  test.fail(
    !matchesContract,
    'Known P1-D3 runtime/documentation mismatch; remove this expected-failure marker when resolved.',
  );
  expect(booking.bookingRef).toMatch(documentedBookingReference);
});
