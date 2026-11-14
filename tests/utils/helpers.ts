import {
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';
import { expect } from '../../src/fixtures/test';
import type { ApiTestResources } from '../../src/fixtures/test';
import { EventHubApi } from '../../src/api/eventhub-api';
import {
  createAuthenticatedApiContext,
  type ApiContextFactory,
} from '../../src/auth/api-auth';
import { UiAuth } from '../../src/auth/ui-auth';
import { appConfig, type TestIdentity } from '../../src/config/environment';
import {
  apiErrorSchema,
  bookingListResponseSchema,
  bookingResponseSchema,
  eventResponseSchema,
  type Booking,
  type CreateBookingInput,
  type CreateEventInput,
  type Event,
} from '../../src/data/contracts';
import {
  createCustomerData,
  createEventInput,
  type CustomerData,
} from '../../src/data/test-data';
import { BookingConfirmationPage } from '../../src/pages/booking-confirmation.page';
import { EventDetailsPage } from '../../src/pages/event-details.page';
import { EventsPage } from '../../src/pages/events.page';
import { MyBookingsPage } from '../../src/pages/my-bookings.page';
import { getDataId } from '../../src/support/api-response';

export function amount(value: number | string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a numeric price, received ${String(value)}.`);
  }
  return parsed;
}

export function formatCurrency(value: number | string): string {
  return `$${amount(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatUiCurrency(value: number | string): string {
  const parsed = amount(value);
  return `$${parsed.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function quantityPattern(quantity: number): RegExp {
  return new RegExp(
    `(?:quantity|tickets?)\\s*:?\\s*${quantity}|${quantity}\\s*tickets?`,
    'i',
  );
}

export function secondTestIdentity(): TestIdentity | undefined {
  return appConfig.testIdentityB;
}

export async function createEvent(
  resources: ApiTestResources,
  overrides: Partial<CreateEventInput> = {},
): Promise<Event> {
  const created = await resources.createEvent(overrides);
  expect(created.response.status()).toBe(201);
  const event = eventResponseSchema.parse(created.body).data;
  if (created.id === undefined) {
    throw new Error('Created event response did not contain a numeric data.id.');
  }
  expect(created.id).toBe(event.id);
  return event;
}

export function parseCreatedEvent(
  created: Awaited<ReturnType<ApiTestResources['createEvent']>>,
): Event {
  expect(created.response.status()).toBe(201);
  const parsed = eventResponseSchema.parse(created.body);
  if (created.id === undefined) {
    throw new Error(
      'Created event response did not contain a numeric data.id for cleanup.',
    );
  }
  expect(parsed.data.id).toBe(created.id);
  return parsed.data;
}

export async function submitBooking(
  api: EventHubApi,
  resources: ApiTestResources,
  input: Partial<CreateBookingInput>,
): Promise<{ status: number; body: unknown }> {
  const response = await api.createBooking(input);
  const body: unknown = await response.json();
  const id = getDataId(body);
  if (id !== undefined) resources.trackBooking(id);
  return { status: response.status(), body };
}

export async function submitBookingWithResponse(
  api: EventHubApi,
  resources: ApiTestResources,
  input: Partial<CreateBookingInput>,
): Promise<{
  response: Awaited<ReturnType<EventHubApi['createBooking']>>;
  body: unknown;
}> {
  const response = await api.createBooking(input);
  const body: unknown = await response.json();
  const id = getDataId(body);
  if (id !== undefined) resources.trackBooking(id);
  return { response, body };
}

export async function submitRawBooking(
  api: APIRequestContext,
  resources: ApiTestResources,
  input: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const response = await api.post('bookings', { data: input });
  const body: unknown = await response.json();
  const id = getDataId(body);
  if (id !== undefined) resources.trackBooking(id);
  return { status: response.status(), body };
}

export async function createBooking(
  api: EventHubApi,
  resources: ApiTestResources,
  event: Event,
  customer: CustomerData,
  quantity = 1,
): Promise<Booking> {
  const result = await submitBooking(api, resources, {
    eventId: event.id,
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    quantity,
  });
  expect(result.status).toBe(201);
  return bookingResponseSchema.parse(result.body).data;
}

export function parseApiError(body: unknown) {
  const parsed = apiErrorSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`API error response did not match its contract: ${issues}`);
  }
  return parsed.data;
}

export async function readEvent(
  api: EventHubApi,
  id: number,
): Promise<Event> {
  const response = await api.getEvent(id);
  expect(response.status()).toBe(200);
  return eventResponseSchema.parse(await response.json()).data;
}

export async function eventBookings(
  api: EventHubApi,
  resources: ApiTestResources,
  eventId: number,
  status: 'confirmed' | 'cancelled' = 'confirmed',
): Promise<Booking[]> {
  const response = await api.listBookings({
    eventId,
    status,
    page: 1,
    limit: 100,
  });
  expect(response.status()).toBe(200);
  const bookings = bookingListResponseSchema.parse(await response.json()).data;
  for (const booking of bookings) resources.trackBooking(booking.id);
  return bookings;
}

export async function readEventBookings(
  api: EventHubApi,
  eventId: number,
): Promise<Booking[]> {
  const response = await api.listBookings({
    eventId,
    status: 'confirmed',
    page: 1,
    limit: 100,
  });
  expect(response.status()).toBe(200);
  return bookingListResponseSchema.parse(await response.json()).data;
}

export async function trackCustomerBookings(
  api: EventHubApi,
  resources: ApiTestResources,
  eventId: number,
  customerEmail: string,
): Promise<void> {
  const bookings = await readEventBookings(api, eventId);
  for (const booking of bookings) {
    if (booking.customerEmail === customerEmail) {
      resources.trackBooking(booking.id);
    }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function listExistingEvents(
  api: APIRequestContext,
): Promise<Event[]> {
  const response = await api.get('events?page=1&limit=100');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  if (!isRecord(body) || body.success !== true || !Array.isArray(body.data)) {
    throw new Error('The existing events response has an unexpected shape.');
  }
  return body.data.map((item) =>
    eventResponseSchema.parse({ success: true, data: item }).data,
  );
}

export async function bookingForCustomerOnExistingEvent(
  api: EventHubApi,
  resources: ApiTestResources,
  eventId: number,
  email: string,
): Promise<Booking> {
  const bookings = await readEventBookings(api, eventId);
  const customerBookings = bookings.filter(
    (candidate) => candidate.customerEmail === email,
  );
  expect(customerBookings).toHaveLength(1);
  if (customerBookings.length !== 1) {
    throw new Error(`Expected one booking for ${email} on existing event ${eventId}.`);
  }
  resources.trackBooking(customerBookings[0].id);
  return customerBookings[0];
}

export async function existingEventWithAvailability(
  api: APIRequestContext,
  predicate: (event: Event) => boolean,
  requirement: string,
): Promise<Event> {
  const events = await listExistingEvents(api);
  const event = events.find(predicate);
  if (event) return event;
  const availableSeats = events.map((item) => item.availableSeats).join(', ');
  throw new Error(
    `No existing event meets the requirement: ${requirement}. ` +
      `Available seats on the first API page: ${availableSeats || '(none)'}.`,
  );
}

export async function openExistingEvent(
  page: Page,
  eventDetailsPage: EventDetailsPage,
  event: Event,
): Promise<void> {
  await page.goto(`/events/${event.id}`);
  await expect(eventDetailsPage.heading).toHaveText(event.title);
}

export async function createApiBooking(
  api: EventHubApi,
  resources: ApiTestResources,
  input: CreateBookingInput,
): Promise<Booking> {
  const response = await api.createBooking(input);
  expect(response.status()).toBe(201);
  const booking = bookingResponseSchema.parse(await response.json()).data;
  resources.trackBooking(booking.id);
  return booking;
}

export async function bookingForCustomer(
  api: EventHubApi,
  resources: ApiTestResources,
  eventId: number,
  email: string,
): Promise<Booking> {
  const bookings = await eventBookings(api, resources, eventId);
  const booking = bookings.find((candidate) => candidate.customerEmail === email);
  expect(booking).toBeDefined();
  if (!booking) {
    throw new Error(`No booking for ${email} was found on owned event ${eventId}.`);
  }
  return booking;
}

export async function openEvent(
  eventsPage: EventsPage,
  eventDetailsPage: EventDetailsPage,
  event: Event,
): Promise<void> {
  await eventsPage.goto();
  await eventsPage.openEvent(event.title);
  await expect(eventDetailsPage.heading).toHaveText(event.title);
}

export async function bookThroughUi(
  eventsPage: EventsPage,
  eventDetailsPage: EventDetailsPage,
  confirmationPage: BookingConfirmationPage,
  event: Event,
  quantity: number,
  customer: CustomerData,
): Promise<string> {
  await openEvent(eventsPage, eventDetailsPage, event);
  await eventDetailsPage.bookingForm.increaseQuantityBy(quantity - 1);
  await eventDetailsPage.bookingForm.fillCustomerDetails(customer);
  await expect(
    eventDetailsPage.bookingForm.totalAmount(
      formatUiCurrency(Number(event.price) * quantity),
    ),
  ).toBeVisible();
  await eventDetailsPage.bookingForm.submitBooking();
  await expect(confirmationPage.heading).toBeVisible();
  const details = await confirmationPage.readBookingDetails();
  const reference = details.match(/\b(?:EVT|[A-Z])-[A-Z0-9]{6}\b/)?.[0];
  expect(reference).toBeDefined();
  if (!reference) throw new Error('Booking confirmation did not expose a reference.');
  return reference;
}

export async function bookExistingEventThroughUi(
  page: Page,
  eventDetailsPage: EventDetailsPage,
  confirmationPage: BookingConfirmationPage,
  event: Event,
  quantity: number,
  customer: CustomerData,
): Promise<string> {
  await openExistingEvent(page, eventDetailsPage, event);
  await eventDetailsPage.bookingForm.increaseQuantityBy(quantity - 1);
  await eventDetailsPage.bookingForm.fillCustomerDetails(customer);
  await expect(
    eventDetailsPage.bookingForm.totalAmount(
      formatUiCurrency(Number(event.price) * quantity),
    ),
  ).toBeVisible();
  await eventDetailsPage.bookingForm.submitBooking();
  await expect(confirmationPage.heading).toBeVisible();
  const details = await confirmationPage.readBookingDetails();
  const reference = details.match(/\b(?:EVT|[A-Z])-[A-Z0-9]{6}\b/)?.[0];
  expect(reference).toBeDefined();
  if (!reference) throw new Error('Booking confirmation did not expose a reference.');
  return reference;
}

export async function bookThroughUiFromApiTest(
  eventsPage: EventsPage,
  eventDetailsPage: EventDetailsPage,
  confirmationPage: BookingConfirmationPage,
  event: Event,
  customer: CustomerData,
  quantity = 1,
): Promise<string> {
  await eventsPage.goto();
  await eventsPage.openEvent(event.title);
  await eventDetailsPage.bookingForm.increaseQuantityBy(quantity - 1);
  await eventDetailsPage.bookingForm.fillCustomerDetails(customer);
  await eventDetailsPage.bookingForm.submitBooking();
  await expect(confirmationPage.heading).toBeVisible();
  const reference = (await confirmationPage.readBookingDetails()).match(
    /\b(?:EVT|[A-Z])-[A-Z0-9]{6}\b/,
  )?.[0];
  if (!reference) {
    throw new Error('Booking confirmation did not expose a booking reference.');
  }
  return reference;
}

export async function assertSoldOutEventCannotBeBooked(
  resources: ApiTestResources,
  eventHubApi: EventHubApi,
  authenticatedPage: Page,
  eventsPage: EventsPage,
  eventDetailsPage: EventDetailsPage,
  confirmationPage: BookingConfirmationPage,
): Promise<void> {
  const event = await createEvent(resources, { totalSeats: 1 });
  const existingBooking = await createApiBooking(eventHubApi, resources, {
    eventId: event.id,
    customerName: 'Existing EventHub Customer',
    customerEmail: `existing.${event.id}@example.com`,
    customerPhone: '2025550198',
    quantity: 1,
  });
  const updatedEvent = eventResponseSchema.parse(
    await (await eventHubApi.getEvent(event.id)).json(),
  ).data;
  expect(updatedEvent.availableSeats).toBe(0);

  await eventsPage.goto();
  const eventLink = authenticatedPage.getByRole('link', {
    name: event.title,
    exact: true,
  });
  if (await eventLink.count() === 1) {
    await eventLink.click();
  } else {
    await authenticatedPage.goto(`/events/${event.id}`);
  }
  await expect(eventDetailsPage.heading).toHaveText(event.title);

  const submitButtonCount =
    await eventDetailsPage.bookingForm.confirmBookingButton.count();
  if (submitButtonCount === 1) {
    if (await eventDetailsPage.bookingForm.confirmBookingButton.isEnabled()) {
      await eventDetailsPage.bookingForm.fillCustomerDetails(createCustomerData());
      await eventDetailsPage.bookingForm.submitBooking();
      await expect(confirmationPage.heading).not.toBeVisible();
    } else {
      await expect(eventDetailsPage.bookingForm.confirmBookingButton).toBeDisabled();
    }
  } else {
    expect(submitButtonCount).toBe(0);
  }

  const bookings = await eventBookings(eventHubApi, resources, event.id);
  expect(bookings).toHaveLength(1);
  expect(bookings[0].id).toBe(existingBooking.id);
}

export interface SecondAccountSession {
  page: Page;
  api: EventHubApi;
  dispose(): Promise<void>;
}

export async function createSecondAccountSession(
  browser: Browser,
  createContext: ApiContextFactory,
  identity: TestIdentity,
): Promise<SecondAccountSession> {
  const browserContext = await browser.newContext({
    baseURL: appConfig.webBaseUrl,
  });
  let apiContext: APIRequestContext | undefined;

  try {
    apiContext = await createAuthenticatedApiContext(
      createContext,
      appConfig.apiBaseUrl,
      identity,
    );
    const page = await browserContext.newPage();
    await new UiAuth(page).signIn(identity);
    const accountBApi = new EventHubApi(apiContext);

    return {
      page,
      api: accountBApi,
      async dispose() {
        await Promise.all([browserContext.close(), apiContext?.dispose()]);
      },
    };
  } catch (error) {
    await browserContext.close();
    await apiContext?.dispose();
    throw error;
  }
}

export async function cleanupSecondAccountBookings(
  api: EventHubApi,
  eventId: number,
  customerEmail: string,
): Promise<void> {
  const response = await api.listBookings({
    eventId,
    status: 'confirmed',
    page: 1,
    limit: 100,
  });
  if ([403, 404].includes(response.status())) return;
  if (response.status() !== 200) {
    throw new Error(
      `Account B booking cleanup query returned HTTP ${response.status()}.`,
    );
  }

  const bookings = bookingListResponseSchema.parse(await response.json()).data;
  for (const booking of bookings.filter(
    (item) => item.customerEmail === customerEmail,
  )) {
    const deleted = await api.deleteBooking(booking.id);
    if (![200, 204, 404].includes(deleted.status())) {
      throw new Error(
        `Account B booking cleanup returned HTTP ${deleted.status()}.`,
      );
    }
  }
}

export async function withSecondAccountBooking<T>(
  identity: TestIdentity,
  createContext: ApiContextFactory,
  action: (api: EventHubApi, event: Event, booking: Booking) => Promise<T>,
): Promise<T> {
  const context = await createAuthenticatedApiContext(
    createContext,
    appConfig.apiBaseUrl,
    identity,
  );
  const api = new EventHubApi(context);
  let eventId: number | undefined;

  try {
    const eventResponse = await api.createEvent(createEventInput({ totalSeats: 2 }));
    const eventBody: unknown = await eventResponse.json();
    eventId = getDataId(eventBody);
    expect(eventResponse.status()).toBe(201);
    const event = eventResponseSchema.parse(eventBody).data;
    if (eventId === undefined) {
      throw new Error('Second-account event response did not contain a numeric data.id.');
    }

    const customer = createCustomerData();
    const bookingResponse = await api.createBooking({
      eventId: event.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      quantity: 1,
    });
    const bookingBody: unknown = await bookingResponse.json();
    expect(bookingResponse.status()).toBe(201);
    const booking = bookingResponseSchema.parse(bookingBody).data;

    return await action(api, event, booking);
  } finally {
    try {
      if (eventId !== undefined) {
        const deleted = await api.deleteEvent(eventId);
        if (![200, 204, 404].includes(deleted.status())) {
          throw new Error(
            `Second-account event cleanup returned HTTP ${deleted.status()}.`,
          );
        }
      }
    } finally {
      await context.dispose();
    }
  }
}

export async function countVisibleConfirmations(
  first: Locator,
  second: Locator,
): Promise<number> {
  const [firstVisible, secondVisible] = await Promise.all([
    first.isVisible(),
    second.isVisible(),
  ]);
  return Number(firstVisible) + Number(secondVisible);
}

export async function readBookingsFromBothAccountsForCustomers(
  accountAApi: EventHubApi,
  accountBApi: EventHubApi,
  eventId: number,
  customerEmails: string[],
): Promise<Booking[]> {
  const [accountAResponse, accountBResponse] = await Promise.all([
    accountAApi.listBookings({
      eventId,
      status: 'confirmed',
      page: 1,
      limit: 100,
    }),
    accountBApi.listBookings({
      eventId,
      status: 'confirmed',
      page: 1,
      limit: 100,
    }),
  ]);
  expect(accountAResponse.status()).toBe(200);
  expect(accountBResponse.status()).toBe(200);
  const accountABookings = bookingListResponseSchema.parse(
    await accountAResponse.json(),
  ).data;
  const accountBBookings = bookingListResponseSchema.parse(
    await accountBResponse.json(),
  ).data;
  return [...accountABookings, ...accountBBookings].filter((booking) =>
    customerEmails.includes(booking.customerEmail),
  );
}
