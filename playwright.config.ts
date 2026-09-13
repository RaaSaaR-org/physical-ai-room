import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4178/physical-ai-room/',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node scripts/serve-test.mjs',
    url: 'http://127.0.0.1:4178/physical-ai-room/',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
