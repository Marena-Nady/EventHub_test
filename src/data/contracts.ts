import { z } from 'zod';

export type EventCategory =
  | 'Conference'
  | 'Concert'
  | 'Sports'
  | 'Workshop'
  | 'Festival';

export type BookingStatus = 'confirmed' | 'cancelled';

export interface CreateEventInput {
  title: string;
  category: EventCategory;
  venue: string;
  city: string;
  eventDate: string;
  price: number;
  totalSeats: number;
  description?: string;
  imageUrl?: string;
}

export interface Event {
  id: number;
  title: string;
  category: EventCategory;
  venue: string;
  city: string;
  eventDate: string;
  price: number | string;
  totalSeats: number;
  availableSeats: number;
  description?: string;
  imageUrl?: string;
}

export interface CreateBookingInput {
  eventId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  quantity: number;
}

export interface Booking {
  id: number;
  eventId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  quantity: number;
  totalPrice: number | string;
  status: BookingStatus;
  bookingRef: string;
  createdAt: string;
  updatedAt: string;
  event: Event;
}

const eventSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  category: z.enum(['Conference', 'Concert', 'Sports', 'Workshop', 'Festival']),
  venue: z.string(),
  city: z.string(),
  eventDate: z.string(),
  price: z.union([z.number(), z.string()]),
  totalSeats: z.number().int().nonnegative(),
  availableSeats: z.number().int().nonnegative(),
});

export const bookingSchema = z.object({
  id: z.number().int().positive(),
  eventId: z.number().int().positive(),
  customerName: z.string().min(2),
  customerEmail: z.email(),
  customerPhone: z.string().min(10),
  quantity: z.number().int().min(1).max(10),
  totalPrice: z.union([z.number(), z.string()]),
  status: z.enum(['confirmed', 'cancelled']),
  bookingRef: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  event: eventSchema,
});

export const bookingResponseSchema = z.object({
  success: z.literal(true),
  data: bookingSchema,
  message: z.string().optional(),
});

export const bookingListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(bookingSchema),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export const eventResponseSchema = z.object({
  success: z.literal(true),
  data: eventSchema,
});

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
  details: z.array(z.object({
    field: z.string().min(1),
    message: z.string().min(1),
  })).optional(),
});

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiListSuccess<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: true;
  token: string;
  user: {
    id: number;
    email: string;
  };
}

export interface MeResponse {
  success: true;
  user: {
    userId: number;
    email: string;
  };
}

export function isAuthResponse(value: unknown): value is AuthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const response = value as Record<string, unknown>;
  if (
    response.success !== true ||
    typeof response.token !== 'string' ||
    typeof response.user !== 'object' ||
    response.user === null
  ) {
    return false;
  }

  const user = response.user as Record<string, unknown>;
  return typeof user.id === 'number' && typeof user.email === 'string';
}

export function isMeResponse(value: unknown): value is MeResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const response = value as Record<string, unknown>;
  if (response.success !== true || typeof response.user !== 'object' || response.user === null) {
    return false;
  }

  const user = response.user as Record<string, unknown>;
  return typeof user.userId === 'number' && typeof user.email === 'string';
}
