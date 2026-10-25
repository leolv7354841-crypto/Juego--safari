import { defineConfig, devices } from '@playwright/test';

// Pruebas de extremo a extremo: Chromium y WebKit (el motor de Safari).
// El juego se sirve estático en 4173 y el servidor en línea corre en 2599 (puertos propios para no
// chocar con `npm run dev` ni `npm run server`).
const WEB = Number(process.env.E2E_WEB_PORT || 4173);
const SERVER = Number(process.env.E2E_SERVER_PORT || 2599);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: `npx vite preview --port ${WEB}`,
      url: `http://127.0.0.1:${WEB}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node src/index.ts',
      cwd: 'server',
      env: { PORT: String(SERVER), HOST: '127.0.0.1', MAX_ROOMS: '8' },
      url: `http://127.0.0.1:${SERVER}/health`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
