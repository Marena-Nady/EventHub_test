import 'dotenv/config';

export interface TestIdentity {
  email: string;
  password: string;
}

export interface AppConfig {
  webBaseUrl: string;
  apiBaseUrl: string;
  testIdentity?: TestIdentity;
  testIdentityB?: TestIdentity;
}

function readBaseUrl(name: string, value: string | undefined): string {
  const rawUrl = value?.trim();
  if (!rawUrl) {
    throw new Error(`${name} is required and must be an absolute HTTP or HTTPS URL.`);
  }

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
  const useNamedAccountA = Boolean(
    env.TEST_USER_EMAIL_A?.trim() || env.TEST_USER_PASSWORD_A,
  );
  const emailA = useNamedAccountA
    ? env.TEST_USER_EMAIL_A?.trim() || undefined
    : env.TEST_USER_EMAIL?.trim() || undefined;
  const passwordA = useNamedAccountA
    ? env.TEST_USER_PASSWORD_A || undefined
    : env.TEST_USER_PASSWORD || undefined;
  const emailB = env.TEST_USER_EMAIL_B?.trim() || undefined;
  const passwordB = env.TEST_USER_PASSWORD_B || undefined;

  if (Boolean(emailA) !== Boolean(passwordA)) {
    throw new Error(
      'Set both TEST_USER_EMAIL_A and TEST_USER_PASSWORD_A, or leave both unset.',
    );
  }
  if (Boolean(emailB) !== Boolean(passwordB)) {
    throw new Error(
      'Set both TEST_USER_EMAIL_B and TEST_USER_PASSWORD_B, or leave both unset.',
    );
  }

  return {
    webBaseUrl: readBaseUrl('WEB_BASE_URL', env.WEB_BASE_URL),
    apiBaseUrl: readBaseUrl('API_BASE_URL', env.API_BASE_URL),
    ...(emailA && passwordA ? { testIdentity: { email: emailA, password: passwordA } } : {}),
    ...(emailB && passwordB ? { testIdentityB: { email: emailB, password: passwordB } } : {}),
  };
}

export const appConfig = loadAppConfig();

export function requireTestIdentity(config: AppConfig = appConfig): TestIdentity {
  if (!config.testIdentity) {
    throw new Error(
      'Authenticated tests require TEST_USER_EMAIL_A and TEST_USER_PASSWORD_A from a dedicated test account.',
    );
  }

  return config.testIdentity;
}
