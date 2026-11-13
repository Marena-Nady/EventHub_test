import 'dotenv/config';

export interface TestIdentity {
  email: string;
  password: string;
}

export interface AppConfig {
  webBaseUrl: string;
  apiBaseUrl: string;
  testIdentity?: TestIdentity;
}

const defaultWebBaseUrl = 'https://eventhub.rahulshettyacademy.com';
const defaultApiBaseUrl = 'https://api.eventhub.rahulshettyacademy.com/api';

function readBaseUrl(name: string, value: string | undefined, fallback: string): string {
  const rawUrl = value?.trim() || fallback;
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${name} must be an absolute HTTP or HTTPS URL.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must not contain credentials, a query, or a fragment.`);
  }

  return url.toString().replace(/\/+$/, '');
}

export function loadAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const email = env.TEST_USER_EMAIL?.trim() || undefined;
  const password = env.TEST_USER_PASSWORD || undefined;

  if (Boolean(email) !== Boolean(password)) {
    throw new Error(
      'Set both TEST_USER_EMAIL and TEST_USER_PASSWORD, or leave both unset.',
    );
  }

  return {
    webBaseUrl: readBaseUrl('WEB_BASE_URL', env.WEB_BASE_URL, defaultWebBaseUrl),
    apiBaseUrl: readBaseUrl('API_BASE_URL', env.API_BASE_URL, defaultApiBaseUrl),
    ...(email && password ? { testIdentity: { email, password } } : {}),
  };
}

export const appConfig = loadAppConfig();

export function requireTestIdentity(config: AppConfig = appConfig): TestIdentity {
  if (!config.testIdentity) {
    throw new Error(
      'Authenticated smoke tests require TEST_USER_EMAIL and TEST_USER_PASSWORD from a dedicated test account.',
    );
  }

  return config.testIdentity;
}
