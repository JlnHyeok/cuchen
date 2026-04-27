import test from "node:test";
import assert from "node:assert/strict";
import { IngestService } from "../src/services/ingestService.js";
import { InMemoryObjectStore } from "../src/storage/objectStore.js";

test("search filters by productNo and threshold range", async () => {
  const service = new IngestService({
    store: new InMemoryObjectStore(),
    concurrency: 1
  });
  await service.init();
  service.manifest = {
    version: 1,
    updatedAt: new Date().toISOString(),
    count: 3,
    items: {
      a: {
        id: "a",
        productNo: "PRD-1",
        capturedAt: "2026-01-01T00:00:00.000Z",
        aiResult: "PASS",
        threshold: 0.1
      },
      b: {
        id: "b",
        productNo: "PRD-2",
        capturedAt: "2026-01-01T01:00:00.000Z",
        aiResult: "FAIL",
        threshold: 0.4
      },
      c: {
        id: "c",
        productNo: "PRD-2",
        capturedAt: "2026-01-01T02:00:00.000Z",
        aiResult: "FAIL",
        threshold: 0.9
      }
    }
  };

  const byProduct = service.search({ productNo: "PRD-2", page: 1, pageSize: 10 });
  const byThreshold = service.search({
    aiResult: "FAIL",
    thresholdMin: "0.3",
    thresholdMax: "0.5",
    page: 1,
    pageSize: 10
  });

  assert.equal(byProduct.total, 2);
  assert.deepEqual(
    byThreshold.items.map((item) => item.id),
    ["b"]
  );
});
