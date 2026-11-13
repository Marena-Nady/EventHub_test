export type EventCategory =
  | 'Conference'
  | 'Concert'
  | 'Sports'
  | 'Workshop'
  | 'Festival';

export type BookingStatus = 'confirmed' | 'cancelled';

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
