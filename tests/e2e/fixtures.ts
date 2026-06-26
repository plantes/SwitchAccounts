import { test as base, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AccountProfile, BackgroundRequest, ExportBundle, OperationResult } from "../../src/domain/models";
import { startTestSite, type TestSite } from "../fixtures/site/server";

interface ExtensionFixture {
  context: BrowserContext;
  extensionId: string;
  worker: Worker;
  extensionPage: Page;
  send: <T>(request: BackgroundRequest) => Promise<OperationResult<T>>;
  tabIdFor: (urlPart: string) => Promise<number>;
}

interface Fixtures {
  site: TestSite;
  extension: ExtensionFixture;
}

export const test = base.extend<Fixtures>({
  site: async ({}, use) => {
    const site = await startTestSite();
    try {
      await use(site);
    } finally {
      await site.close();
    }
  },

  extension: async ({ site }, use) => {
    const extensionPath = await prepareGrantedExtension();
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "switchaccounts-e2e-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--host-resolver-rules=MAP example.test 127.0.0.1,MAP sub.example.test 127.0.0.1",
        "--no-proxy-server",
      ],
    });

    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;

    const extensionPage = await context.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/options.html`);

    const fixture: ExtensionFixture = {
      context,
      extensionId,
      worker,
      extensionPage,
      send: (request) => extensionPage.evaluate((message) => chrome.runtime.sendMessage(message), request),
      tabIdFor: async (urlPart) => {
        const tabs = await extensionPage.evaluate(() => chrome.tabs.query({}));
        const tab = tabs.find((candidate) => candidate.url?.includes(urlPart));
        if (!tab?.id) throw new Error(`No tab found for ${urlPart}. Tabs: ${JSON.stringify(tabs.map((candidate) => candidate.url))}`);
        return tab.id;
      },
    };

    try {
      await use(fixture);
    } finally {
      await context.close();
      await fs.rm(path.dirname(extensionPath), { recursive: true, force: true });
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  },
});

export { expect } from "@playwright/test";
export type { AccountProfile, ExportBundle };

async function prepareGrantedExtension(): Promise<string> {
  const source = path.resolve(".output/chrome-mv3");
  const manifestPath = path.join(source, "manifest.json");
  await fs.access(manifestPath);

  const destinationRoot = await fs.mkdtemp(path.join(os.tmpdir(), "switchaccounts-extension-"));
  const destination = path.join(destinationRoot, "chrome-mv3");
  await fs.cp(source, destination, { recursive: true });

  const copiedManifestPath = path.join(destination, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(copiedManifestPath, "utf8")) as {
    host_permissions?: string[];
    optional_host_permissions?: string[];
  };
  manifest.host_permissions = ["http://*/*", "https://*/*"];
  await fs.writeFile(copiedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return destination;
}
