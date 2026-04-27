import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { FixtureService } from "../src/services/fixtureService.js";
import { IngestService } from "../src/services/ingestService.js";
import { InMemoryObjectStore } from "../src/storage/objectStore.js";

test("app endpoints generate, ingest, search, fetch metadata and image", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "app-fixtures-"));
  const config = {
    defaultFixtureDir: dir,
    minioEndpoint: "memory://local",
    minioBucket: "memory"
  };
  const fixtureService = new FixtureService();
  const ingestService = new IngestService({
    store: new InMemoryObjectStore(),
    concurrency: 2
  });
  await ingestService.init();

  const server = createApp({ fixtureService, ingestService, config });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const generated = await postJson(`${baseUrl}/fixtures/generate`, {
      count: 2,
      outputDir: dir
    });
    assert.equal(generated.count, 2);

    const ingested = await postJson(`${baseUrl}/ingest/scan`, { inputDir: dir });
    assert.equal(ingested.uploaded, 2);

    const search = await getJson(`${baseUrl}/images/search?aiResult=FAIL&page=1&pageSize=10`);
    assert.equal(search.total, 1);

    const id = search.items[0].id;
    const metadata = await getJson(`${baseUrl}/images/${id}/metadata`);
    assert.equal(metadata.id, id);
    assert.equal(metadata.tag.result, "FAIL");

    const image = await fetch(`${baseUrl}/images/${id}`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    const bytes = await image.arrayBuffer();
    assert.ok(bytes.byteLength > 100);
  } finally {
    server.close();
    await once(server, "close");
  }
});

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}
