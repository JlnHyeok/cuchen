import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { FixtureService } from "../src/services/fixtureService.js";
import {
  IngestService,
  normalizeFixtureJson,
  scanInputDirectory
} from "../src/services/ingestService.js";
import { InMemoryObjectStore } from "../src/storage/objectStore.js";

test("scanInputDirectory detects pairs and orphans", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "scan-input-"));
  await fs.writeFile(path.join(dir, "a.png"), Buffer.from("x"));
  await fs.writeFile(path.join(dir, "a.json"), "{}");
  await fs.writeFile(path.join(dir, "b.png"), Buffer.from("y"));

  const result = await scanInputDirectory(dir);
  assert.equal(result.pairs.length, 1);
  assert.deepEqual(result.orphans, ["b"]);
});

test("normalizeFixtureJson extracts meta and tag from flat json fields", () => {
  const normalized = normalizeFixtureJson({
    productNo: "PRD-1",
    capturedAt: "2026-01-01T00:00:00.000Z",
    result: "PASS",
    threshold: "0.7",
    lotNo: "LOT-001",
    inspectorModel: "vision-v1"
  });

  assert.equal(normalized.meta.productNo, "PRD-1");
  assert.equal(normalized.meta.lotNo, "LOT-001");
  assert.equal(normalized.tag.result, "PASS");
  assert.equal(normalized.tag.inspectorModel, "vision-v1");
  assert.equal(normalized.tag.threshold, 0.7);
});

test("normalizeFixtureJson still supports legacy meta/tag payloads", () => {
  const normalized = normalizeFixtureJson({
    meta: { productNo: "PRD-2", capturedAt: "2026-01-01T00:00:00.000Z", lotNo: "LOT-002" },
    tag: { aiResult: "FAIL", threshold: "0.3", inspectedAt: "2026-01-01T00:00:03.000Z" }
  });

  assert.equal(normalized.meta.productNo, "PRD-2");
  assert.equal(normalized.meta.lotNo, "LOT-002");
  assert.equal(normalized.tag.aiResult, "FAIL");
  assert.equal(normalized.tag.threshold, 0.3);
});

test("ingestDirectory stores records and updates manifest", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-dir-"));
  const fixtureService = new FixtureService();
  await fixtureService.generateFixtures({ count: 2, outputDir: dir });

  const ingestService = new IngestService({
    store: new InMemoryObjectStore(),
    concurrency: 2
  });
  await ingestService.init();

  const result = await ingestService.ingestDirectory(dir);
  const search = ingestService.search({ page: 1, pageSize: 10 });

  assert.equal(result.uploaded, 2);
  assert.equal(result.failed, 0);
  assert.equal(search.total, 2);
  assert.ok(search.items[0].id);
});
