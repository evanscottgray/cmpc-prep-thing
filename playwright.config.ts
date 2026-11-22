import { defineConfig, devices } from '@playwright/test';

// WebKit at four device sizes. Run inside the Playwright Docker image: `npm run e2e`.
const PORT = Number(process.env.E2E_PORT || 4310);
const LAN_PORT = Number(process.env.E2E_LAN_PORT || 4311);
const sizes = {
  'iphone-se': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-15': { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    browserName: 'webkit',
    userAgent: devices['iPhone 15'].userAgent,
    trace: 'off',
  },
  projects: Object.entries(sizes).map(([name, use]) => ({ name, use: { ...use, userAgent: name.startsWith('ipad') ? devices['iPad Pro 11'].userAgent : devices['iPhone 15'].userAgent } })),
  webServer: [
    { command: `node scripts/serve.mjs --host 127.0.0.1 --port ${PORT}`, port: PORT, reuseExistingServer: false },
    { command: `node scripts/serve.mjs --host 0.0.0.0 --port ${LAN_PORT}`, port: LAN_PORT, reuseExistingServer: false },
  ],
});
