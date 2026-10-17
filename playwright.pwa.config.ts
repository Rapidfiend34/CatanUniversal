import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: '**/pwa.spec.ts', testIgnore: [], timeout: 90000,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4173' },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30000 },
});
