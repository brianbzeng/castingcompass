import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    hasTouch: true,
    isMobile: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "iphone-se", use: { browserName: "chromium", viewport: { width: 375, height: 667 } } },
    { name: "iphone-13", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "pixel-7", use: { browserName: "chromium", viewport: { width: 412, height: 915 } } },
    { name: "webkit-iphone-13", use: { browserName: "webkit", viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npm run start -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
