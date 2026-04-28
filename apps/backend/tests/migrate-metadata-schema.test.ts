import assert from "node:assert/strict";
import test from "node:test";
import { planMetadataMigration } from "../src/maintenance/migrate-metadata-schema.js";

test("migration plan converts legacy fields to canonical metadata", () => {
  const plan = planMetadataMigration({
    _id: "1",
    imageId: "sample-1",
    productNo: "PRD-10001",
    capturedAt: "2026-04-21T10:00:00.000Z",
    processCode: "P-001",
    result: "pass",
    threshold: "0.42",
    size: "1024",
    confidence: "0.87",
    metadata: {
      lotNo: "LOT-001",
      cameraId: "CAM-01",
      version: "v1"
    }
  });

  assert.equal(plan.status, "update");
  assert.deepEqual(plan.metadata, {
    lotNo: "LOT-001",
    processId: "CAM-01",
    version: "v1",
    product_id: "PRD-10001",
    div: "P-001",
    capturedAt: "2026-04-21T10:00:00.000Z",
    result: "PASS",
    threshold: 0.42,
    prob: 0.87,
    size: 1024
  });
  assert.deepEqual(new Set(plan.unsetRootKeys), new Set([
    "productNo",
    "capturedAt",
    "processCode",
    "result",
    "threshold",
    "size",
    "confidence"
  ]));
});

test("migration plan adds default version to already normalized records", () => {
  const plan = planMetadataMigration({
    _id: "2",
    imageId: "sample-2",
    metadata: {
      product_id: "PRD-20002",
      div: "P-002",
      capturedAt: "2026-04-21T10:30:00.000Z",
      result: "FAIL",
      threshold: 0.12,
      prob: 0.98,
      lotNo: "LOT-002"
    }
  });

  assert.equal(plan.status, "update");
  assert.equal(plan.metadata?.version, "v1");
});

test("migration plan skips documents missing required canonical fields", () => {
  const plan = planMetadataMigration({
    _id: "3",
    imageId: "sample-3",
    metadata: {
      product_id: "PRD-30003",
      capturedAt: "2026-04-21T10:45:00.000Z",
      result: "REVIEW"
    }
  });

  assert.equal(plan.status, "skip");
  assert.equal(plan.reason, "missing_div");
});
