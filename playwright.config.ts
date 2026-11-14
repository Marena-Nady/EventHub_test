import { defineConfig, devices } from '@playwright/test';
import { appConfig } from './src/config/environment';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: appConfig.webBaseUrl,
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'api',
      testMatch: ['**/*.api.spec.ts', '**/api_tests.ts'],
    },
    {
      name: 'chromium',
      testMatch: ['**/*.ui.spec.ts', '**/ui_tests.ts'],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
