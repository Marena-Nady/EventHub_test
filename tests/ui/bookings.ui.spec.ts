import { test, expect } from '../../src/fixtures/test';
import {
  bookingListResponseSchema,
  eventResponseSchema,
} from '../../src/data/contracts';

test('books two tickets, verifies My Bookings, and cancels the booking', async ({
  apiTestResources,
  bookingConfirmationPage,
  customerData,
  eventDetailsPage,
  eventHubApi,
  eventsPage,
  myBookingsPage,
}) => {
  const createdEvent = await apiTestResources.createEvent();
  expect(createdEvent.response.status()).toBe(201);
  const event = eventResponseSchema.parse(createdEvent.body).data;
  expect(createdEvent.id).toBe(event.id);

  await eventsPage.goto();
  await expect(eventsPage.heading).toBeVisible();
  await eventsPage.openEvent(event.title);
  await expect(eventDetailsPage.heading).toHaveText(event.title);
  await eventDetailsPage.bookingForm.increaseQuantityBy(1);
  await eventDetailsPage.bookingForm.fillCustomerDetails(customerData);
  await expect(eventDetailsPage.bookingForm.totalAmount('$250')).toBeVisible();
  await eventDetailsPage.bookingForm.submitBooking();

  await expect(bookingConfirmationPage.heading).toBeVisible();
  await expect(bookingConfirmationPage.totalAmount('$250')).toBeVisible();
  await expect(bookingConfirmationPage.bookingDetails).toBeVisible();

  const eventBookingsResponse = await eventHubApi.listBookings({
    eventId: event.id,
    status: 'confirmed',
    page: 1,
    limit: 100,
  });
  expect(eventBookingsResponse.status()).toBe(200);
  const eventBookings = bookingListResponseSchema.parse(
    await eventBookingsResponse.json(),
  ).data;
  for (const eventBooking of eventBookings) {
    apiTestResources.trackBooking(eventBooking.id);
  }
  const booking = eventBookings.find(
    (eventBooking) => eventBooking.customerEmail === customerData.email,
  );
  expect(booking).toBeDefined();
  if (!booking) throw new Error('UI booking was not found in the owned event booking list.');

  const confirmationDetails = await bookingConfirmationPage.readBookingDetails();
  const reference = confirmationDetails.match(/\b(?:EVT|[A-Z])-[A-Z0-9]{6}\b/)?.[0];
  expect(reference).toBeDefined();
  if (!reference) throw new Error('Booking confirmation did not expose a reference.');
  expect(reference).toBe(booking.bookingRef);
  expect(booking).toMatchObject({
    eventId: event.id,
    customerName: customerData.name,
    customerEmail: customerData.email,
    quantity: 2,
    status: 'confirmed',
  });

  await myBookingsPage.goto();
  await expect(myBookingsPage.heading).toBeVisible();
  const bookingCard = myBookingsPage.bookingCard(reference);
  await expect(bookingCard).toBeVisible();
  await expect(myBookingsPage.bookingTitle(event.title)).toBeVisible();
  await expect(myBookingsPage.bookingTotal('$250')).toBeVisible();
  await expect(myBookingsPage.cancelBookingButtons).toHaveCount(1);

  await myBookingsPage.cancelBooking();
  await expect(bookingCard).toHaveCount(0);

  const deletedBooking = await eventHubApi.getBooking(booking.id);
  expect(deletedBooking.status()).toBe(404);
  const updatedEvent = eventResponseSchema.parse(
    await (await eventHubApi.getEvent(event.id)).json(),
  ).data;
  expect(updatedEvent.availableSeats).toBe(event.totalSeats);
});

test('shows customer field errors and does not create an invalid booking', async ({
  apiTestResources,
  customerData,
  eventDetailsPage,
  eventHubApi,
  eventsPage,
}) => {
  const createdEvent = await apiTestResources.createEvent();
  expect(createdEvent.response.status()).toBe(201);
  const event = eventResponseSchema.parse(createdEvent.body).data;

  await eventsPage.goto();
  await eventsPage.openEvent(event.title);
  await eventDetailsPage.bookingForm.submitBooking();

  await expect(
    eventDetailsPage.bookingForm.validationMessage('Name must be at least 2 chars'),
  ).toBeVisible();
  await expect(
    eventDetailsPage.bookingForm.validationMessage('Enter a valid email'),
  ).toBeVisible();
  await expect(
    eventDetailsPage.bookingForm.validationMessage('Enter a valid 10-digit phone'),
  ).toBeVisible();

  await eventDetailsPage.bookingForm.fillCustomerDetails({
    ...customerData,
    email: 'invalid-email',
    phone: '123456789',
  });
  await eventDetailsPage.bookingForm.submitBooking();
  await expect(
    eventDetailsPage.bookingForm.validationMessage('Enter a valid email'),
  ).toBeVisible();
  await expect(
    eventDetailsPage.bookingForm.validationMessage('Enter a valid 10-digit phone'),
  ).toBeVisible();

  const bookings = await eventHubApi.listBookings({
    eventId: event.id,
    status: 'confirmed',
  });
  expect(bookings.status()).toBe(200);
  expect(bookingListResponseSchema.parse(await bookings.json()).data).toEqual([]);
});

test('enforces ticket quantity minimum and maximum in the booking form', async ({
  apiTestResources,
  eventDetailsPage,
  eventHubApi,
  eventsPage,
}) => {
  const createdEvent = await apiTestResources.createEvent();
  expect(createdEvent.response.status()).toBe(201);
  const event = eventResponseSchema.parse(createdEvent.body).data;

  await eventsPage.goto();
  await eventsPage.openEvent(event.title);
  await expect(
    eventDetailsPage.bookingForm.decreaseQuantityButton,
  ).toBeDisabled();

  await eventDetailsPage.bookingForm.increaseQuantityBy(9);
  await expect(
    eventDetailsPage.bookingForm.increaseQuantityButton,
  ).toBeDisabled();
  await expect(
    eventDetailsPage.bookingForm.totalAmount('$1,250'),
  ).toBeVisible();

  const bookings = await eventHubApi.listBookings({
    eventId: event.id,
    status: 'confirmed',
  });
  expect(bookings.status()).toBe(200);
  expect(bookingListResponseSchema.parse(await bookings.json()).data).toEqual([]);
});
