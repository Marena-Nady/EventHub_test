import { randomUUID } from 'node:crypto';
import type { CreateEventInput } from './contracts';

export interface CustomerData {
  name: string;
  email: string;
  phone: string;
}

export function createCustomerData(): CustomerData {
  const id = randomUUID();
  return {
    name: `EventHub QA ${id.slice(0, 8)}`,
    email: `eventhub.qa.${id}@example.com`,
    phone: '+15550101234',
  };
}

export function createEventInput(
  overrides: Partial<CreateEventInput> = {},
): CreateEventInput {
  return {
    title: `EventHub API test ${randomUUID()}`,
    category: 'Workshop',
    venue: 'EventHub QA venue',
    city: 'Testville',
    eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    price: 125,
    totalSeats: 20,
    ...overrides,
  };
}
