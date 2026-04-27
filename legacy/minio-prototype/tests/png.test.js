import test from "node:test";
import assert from "node:assert/strict";
import { createFixturePng } from "../src/utils/png.js";

test("createFixturePng returns a PNG signature", () => {
  const png = createFixturePng(1);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(png.length > 100);
});
