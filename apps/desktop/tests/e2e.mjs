import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");
const backendRoot = path.resolve(desktopRoot, "../backend");
const backendPort = 43111;
const backendUrl = `http://127.0.0.1:${backendPort}`;
const tempInbox = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-desktop-e2e-"));
const downloadPath = path.join(tempInbox, "downloaded.png");
const batchDownloadDir = path.join(tempInbox, "batch-downloads");

const fixtureBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2qXioAAAAASUVORK5CYII=",
  "base64"
);

const fixtures = [
  {
    baseName: "sample-000001",
    metadata: {
      productNo: "PRD-100001",
      processCode: "P-01",
      result: "PASS",
      threshold: 0.21,
      capturedAt: "2026-04-21T09:00:00.000Z"
    }
  },
  {
    baseName: "sample-000002",
    metadata: {
      productNo: "PRD-100002",
      processCode: "P-02",
      result: "FAIL",
      threshold: 0.73,
      capturedAt: "2026-04-21T09:05:00.000Z"
    }
  },
  {
    baseName: "sample-000003",
    metadata: {
      productNo: "PRD-100003",
      processCode: "P-03",
      result: "REVIEW",
      threshold: 0.44,
      capturedAt: "2026-04-21T09:10:00.000Z"
    }
  }
];

await seedInbox(tempInbox, fixtures);

const backend = spawn("npm", ["run", "dev"], {
  cwd: backendRoot,
  env: {
    ...process.env,
    NODE_ENV: "test",
    STORAGE_MODE: "memory",
    HOST: "127.0.0.1",
    PORT: String(backendPort),
    CORS_ORIGIN: "",
    INGEST_ROOT_DIR: tempInbox,
    TEST_IO_DELAY_MS: "650",
    TEST_DOWNLOAD_DIR: batchDownloadDir
  },
  stdio: ["ignore", "pipe", "pipe"]
});

backend.stdout.on("data", (chunk) => process.stdout.write(`[backend] ${chunk}`));
backend.stderr.on("data", (chunk) => process.stderr.write(`[backend] ${chunk}`));

try {
await waitForBackend();
await waitForSearchCount(3);

const searchResponse = await fetch(`${backendUrl}/images/search?page=1&pageSize=20`);
const searchPayload = unwrapApiData(await searchResponse.json());
const firstImageId = searchPayload.items?.[0]?.imageId;
assert.ok(firstImageId, "expected at least one ingested image");

const blobResponse = await fetch(`${backendUrl}/images/${encodeURIComponent(firstImageId)}/blob`);
assert.equal(blobResponse.ok, true);
const blobBuffer = await blobResponse.arrayBuffer();
assert.ok(blobBuffer.byteLength > 0);

  const app = await electron.launch({
    args: [desktopRoot],
    cwd: desktopRoot,
    env: {
      ...process.env,
      BACKEND_URL: backendUrl,
      TEST_DOWNLOAD_DIR: batchDownloadDir
    }
  });

  try {
    const window = await app.firstWindow();
    window.on("console", (message) => {
      const values = message.args().map((arg) => arg.toString());
      process.stdout.write(`[desktop:${message.type()}] ${values.join(" ")}\n`);
    });
    window.on("pageerror", (error) => {
      process.stderr.write(`[desktop:pageerror] ${String(error)}\n`);
    });
    await window.waitForLoadState("domcontentloaded");
    assert.equal(await window.locator(".detail-panel").count(), 0);
    await window.waitForFunction(() => {
      const status = document.querySelector("#statusBar")?.textContent ?? "";
      return (
        document.querySelectorAll("#list .item").length > 0 ||
        status.includes("results") ||
        status.includes("검색 실패") ||
        status.includes("0 results")
      );
    }, { timeout: 20000 });

    const initialCount = await window.locator("#list .item").count();
    if (initialCount === 0) {
      const statusText = await window.locator("#statusBar").textContent();
      const bodyText = await window.locator("body").textContent();
      throw new Error(`desktop list did not render items. status=${statusText ?? ""} body=${bodyText ?? ""}`);
    }
    assert.equal(initialCount, 3);

    const headerLabels = await window.locator(".list-head .list-col").evaluateAll((items) =>
      items.map((item) => item.textContent?.trim() ?? "")
    );
    assert.deepEqual(headerLabels, ["선택", "이미지", "product_id", "div", "time", "result", "threshold", "prob", "보기"]);

    const bucketOptions = await window.locator("#bucketSelect option").evaluateAll((options) =>
      options.map((option) => ({
        value: option.value,
        label: option.textContent?.trim() ?? ""
      }))
    );
    assert.ok(bucketOptions.length >= 2);
    await window.locator("#bucketSelect").selectOption(bucketOptions[1].value);
    await window.waitForFunction(() => document.querySelectorAll("#list .item").length === 3);

    await window.locator("#pageSize").selectOption("1");

    await window.waitForFunction(() => document.querySelector("#pageLabel")?.textContent === "1 / 3");
    assert.equal(await window.locator("#pageLabel").textContent(), "1 / 3");

    await window.locator("#nextBtn").click();
    await window.waitForFunction(() => document.querySelector("#pageLabel")?.textContent === "2 / 3");
    assert.equal(await window.locator("#pageLabel").textContent(), "2 / 3");

    await window.locator("#pageSize").selectOption("20");
    await window.waitForFunction(() => document.querySelectorAll("#list .item").length === 3);

    await window.locator("#productId").fill("PRD-100002");
    await window.locator("#searchBtn").click();

    await window.waitForFunction(() => document.querySelectorAll("#list .item").length === 1);

    const filteredCount = await window.locator("#list .item").count();
    assert.equal(filteredCount, 1);
    const filteredRowText = await window.locator("#list .item").textContent();
    assert.ok(filteredRowText?.includes("PRD-100002"));
    assert.ok(filteredRowText?.includes("NG"));

    const activeId = await window.locator("#list .item.active").getAttribute("data-image-id");
    assert.ok(activeId);

    const metadata = await window.evaluate(async (imageId) => {
      return window.viewerApi.getMetadata(imageId);
    }, activeId);
    assert.equal(metadata?.metadata?.productNo, "PRD-100002");
    assert.equal(metadata?.metadata?.result, "FAIL");

    await window.locator("#resetBtn").click();
    await window.waitForFunction(() => document.querySelectorAll("#list .item").length === 3);

    const firstItem = window.locator("#list .item").nth(0);
    const secondItem = window.locator("#list .item").nth(1);
    await firstItem.click();
    await secondItem.click();
    await window.waitForFunction(() => {
      return document.querySelector("#list .item.active")?.getAttribute("data-image-id")?.includes("sample-000002") === true;
    });
    const activeRowId = await window.locator("#list .item.active").getAttribute("data-image-id");
    assert.ok(activeRowId?.includes("sample-000002"));

    await window.locator(`#list .item[data-image-id="${activeId}"] [data-view-image]`).click();
    await window.waitForFunction(() => document.querySelector("#viewerModal")?.classList.contains("is-hidden") === false);
    const modalTitle = await window.locator("#modalTitle").textContent();
    assert.ok(modalTitle?.includes("PRD-100002"));
    await window.waitForFunction(() => {
      const preview = document.querySelector("#modalPreview");
      return Boolean(preview && preview.getAttribute("src")?.includes("/thumbnail"));
    });
    const previewSrc = await window.locator("#modalPreview").getAttribute("src");
    assert.ok(previewSrc?.includes("/thumbnail"));
    await window.waitForFunction(() => {
      const preview = document.querySelector("#modalPreview");
      return Boolean(preview && preview.getAttribute("src")?.includes("/blob"));
    });
    const originalSrc = await window.locator("#modalPreview").getAttribute("src");
    assert.ok(originalSrc?.includes("/blob"));
    await window.waitForFunction(() => document.querySelector("#modalMetadataInfo")?.textContent?.includes("PRD-100002"));
    const modalMetadata = await window.locator("#modalMetadataInfo").textContent();
    assert.ok(modalMetadata?.includes("PRD-100002"));
    await window.locator("#modalCloseBtn").click();
    await window.waitForFunction(() => document.querySelector("#viewerModal")?.classList.contains("is-hidden") === true);

    await window.locator("#list .item").nth(0).locator("input[type='checkbox']").check();
    await window.locator("#list .item").nth(1).locator("input[type='checkbox']").check();
    await window.waitForFunction(() => document.querySelector("#selectedCount")?.textContent === "2 selected");
    assert.equal(await window.locator("#selectedCount").textContent(), "2 selected");

    await window.locator("#downloadBtn").click();
    await waitFor(async () => {
      const batchFiles = await fs.readdir(batchDownloadDir);
      assert.equal(batchFiles.length, 2);
    }, 30_000);
    const batchFiles = await fs.readdir(batchDownloadDir);
    assert.ok(batchFiles.some((name) => name.includes("sample-000001")));
    assert.ok(batchFiles.some((name) => name.includes("sample-000002")));

    const saveResult = await window.evaluate(async ({ targetPath }) => {
      const active = document.querySelector("#list .item.active");
      const imageId = active?.getAttribute("data-image-id");
      if (!imageId) {
        throw new Error("No selected item");
      }
      return window.viewerApi.saveImage(imageId, { targetPath });
    }, { targetPath: downloadPath });

    assert.equal(saveResult?.ok, true);
    const downloaded = await fs.stat(downloadPath);
    assert.ok(downloaded.size > 0);
  } finally {
    await app.close().catch(() => {});
  }
} finally {
  backend.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => backend.once("exit", resolve)),
    delay(5000)
  ]).catch(() => {});
  await fs.rm(tempInbox, { recursive: true, force: true });
}

async function seedInbox(rootDir, entries) {
  await fs.mkdir(rootDir, { recursive: true });
  for (const entry of entries) {
    await fs.writeFile(path.join(rootDir, `${entry.baseName}.png`), fixtureBytes);
    await fs.writeFile(path.join(rootDir, `${entry.baseName}.json`), JSON.stringify(entry.metadata, null, 2));
  }
}

async function waitForBackend() {
  await waitFor(async () => {
    const response = await fetch(`${backendUrl}/health`);
    if (!response.ok) {
      throw new Error(`health check failed: ${response.status}`);
    }
  }, 30_000);
}

async function waitForSearchCount(expectedCount) {
  await waitFor(async () => {
    const response = await fetch(`${backendUrl}/images/search?page=1&pageSize=20`);
    if (!response.ok) {
      throw new Error(`search failed: ${response.status}`);
    }
    const payload = unwrapApiData(await response.json());
    assert.equal(Number(payload.total ?? 0), expectedCount);
  }, 30_000);
}

function unwrapApiData(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    "message" in payload &&
    "data" in payload &&
    "errorCode" in payload &&
    "errorMessage" in payload
  ) {
    return payload.data;
  }
  return payload;
}

async function waitFor(check, timeoutMs) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      await check();
      return;
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }

  throw lastError ?? new Error("Timed out while waiting for condition");
}
