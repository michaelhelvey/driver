import { join } from "node:path";

const APP = join(import.meta.dirname, "..", "src-tauri", "target", "debug", "driver-desktop");

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [{ browserName: "tauri" }],
  services: [
    [
      "@wdio/tauri-service",
      {
        driverProvider: "embedded",
        appBinaryPath: APP,
        captureBackendLogs: false,
        captureFrontendLogs: false,
      },
    ],
  ],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 60_000 },
  logLevel: "warn",
  waitforTimeout: 10_000,
  before: async (_capabilities, _specs, browser) => {
    await browser.switchToWindow(await browser.getWindowHandle());
  },
};
