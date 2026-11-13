import type { APIRequestContext, APIResponse } from '@playwright/test';
import type {
  BookingStatus,
  CreateBookingInput,
  CreateEventInput,
} from '../models/contracts';

export interface BookingListQuery {
  eventId?: number;
  status?: BookingStatus;
  page?: number;
  limit?: number;
}

export class EventHubApi {
  constructor(private readonly request: APIRequestContext) {}

  createEvent(input: CreateEventInput): Promise<APIResponse> {
    return this.request.post('events', { data: input });
  }

  getEvent(id: number): Promise<APIResponse> {
    return this.request.get(`events/${id}`);
  }

  deleteEvent(id: number): Promise<APIResponse> {
    return this.request.delete(`events/${id}`);
  }

  createBooking(input: Partial<CreateBookingInput>): Promise<APIResponse> {
    return this.request.post('bookings', { data: input });
  }

  getBooking(id: number): Promise<APIResponse> {
    return this.request.get(`bookings/${id}`);
  }

  getBookingByReference(reference: string): Promise<APIResponse> {
    return this.request.get(`bookings/ref/${encodeURIComponent(reference)}`);
  }

  listBookings(query: BookingListQuery = {}): Promise<APIResponse> {
    const params = new URLSearchParams();

    if (query.eventId !== undefined) params.set('eventId', String(query.eventId));
    if (query.status !== undefined) params.set('status', query.status);
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.limit !== undefined) params.set('limit', String(query.limit));

    const search = params.toString();
    return this.request.get(search ? `bookings?${search}` : 'bookings');
  }

  deleteBooking(id: number): Promise<APIResponse> {
    return this.request.delete(`bookings/${id}`);
  }
}
