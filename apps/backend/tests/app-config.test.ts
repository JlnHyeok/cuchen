import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { loadAppConfig } from "../src/common/config/app-config.js";

test("default ingest root resolves under backend root, not src", () => {
  const original = process.env.INGEST_ROOT_DIR;
  delete process.env.INGEST_ROOT_DIR;

  try {
    const config = loadAppConfig();
    assert.equal(config.ingestRootDir, path.resolve(process.cwd(), "generated/inbox"));
  } finally {
    if (original === undefined) {
      delete process.env.INGEST_ROOT_DIR;
    } else {
      process.env.INGEST_ROOT_DIR = original;
    }
  }
});

test("ingest watcher polling options are configurable", () => {
  const originalUsePolling = process.env.INGEST_WATCH_USE_POLLING;
  const originalInterval = process.env.INGEST_WATCH_INTERVAL_MS;
  process.env.INGEST_WATCH_USE_POLLING = "true";
  process.env.INGEST_WATCH_INTERVAL_MS = "750";

  try {
    const config = loadAppConfig();
    assert.equal(config.ingestWatchUsePolling, true);
    assert.equal(config.ingestWatchIntervalMs, 750);
  } finally {
    if (originalUsePolling === undefined) {
      delete process.env.INGEST_WATCH_USE_POLLING;
    } else {
      process.env.INGEST_WATCH_USE_POLLING = originalUsePolling;
    }
    if (originalInterval === undefined) {
      delete process.env.INGEST_WATCH_INTERVAL_MS;
    } else {
      process.env.INGEST_WATCH_INTERVAL_MS = originalInterval;
    }
  }
});
