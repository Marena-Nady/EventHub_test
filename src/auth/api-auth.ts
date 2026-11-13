import type { APIRequestContext } from '@playwright/test';
import type { TestIdentity } from '../config/environment';
import { isAuthResponse, isMeResponse } from '../models/contracts';

export interface ApiContextOptions {
  baseURL: string;
  extraHTTPHeaders: Record<string, string>;
}

export type ApiContextFactory = (
  options: ApiContextOptions,
) => Promise<APIRequestContext>;

export async function createAuthenticatedApiContext(
  createContext: ApiContextFactory,
  apiBaseUrl: string,
  identity: TestIdentity,
): Promise<APIRequestContext> {
  const loginContext = await createContext({
    baseURL: `${apiBaseUrl}/`,
    extraHTTPHeaders: { Accept: 'application/json' },
  });

  try {
    const loginResponse = await loginContext.post('auth/login', {
      data: identity,
    });

    if (!loginResponse.ok()) {
      throw new Error(
        `API login failed with HTTP ${loginResponse.status()}; verify the test account and API_BASE_URL.`,
      );
    }

    const loginBody: unknown = await loginResponse.json();
    if (!isAuthResponse(loginBody)) {
      throw new Error('API login response did not match the documented auth contract.');
    }

    const authenticatedContext = await createContext({
      baseURL: `${apiBaseUrl}/`,
      extraHTTPHeaders: {
        Accept: 'application/json',
        Authorization: `Bearer ${loginBody.token}`,
      },
    });

    let authenticated = false;
    try {
      const meResponse = await authenticatedContext.get('auth/me');
      if (!meResponse.ok()) {
        throw new Error(
          `Authenticated API check failed with HTTP ${meResponse.status()} at /auth/me.`,
        );
      }

      const meBody: unknown = await meResponse.json();
      if (!isMeResponse(meBody)) {
        throw new Error('/auth/me response did not match the documented user contract.');
      }

      authenticated = true;
      return authenticatedContext;
    } finally {
      if (!authenticated) {
        await authenticatedContext.dispose();
      }
    }
  } finally {
    await loginContext.dispose();
  }
}
