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
