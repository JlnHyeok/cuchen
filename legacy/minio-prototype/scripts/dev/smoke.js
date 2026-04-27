import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { getConfig } from "../../src/config.js";
import { createApp } from "../../src/app.js";
import { FixtureService } from "../../src/services/fixtureService.js";
import { IngestService } from "../../src/services/ingestService.js";
import { createStore } from "../../src/storage/createStore.js";

const config = getConfig();
const fixtureDir = path.join(config.defaultFixtureDir, "smoke");
const fixtureService = new FixtureService();
const ingestService = new IngestService({
  store: createStore(config),
  concurrency: config.ingestConcurrency
});

await ingestService.init();
await resetDirectory(fixtureDir);

const server = createApp({ fixtureService, ingestService, config });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const generated = await postJson(`${baseUrl}/fixtures/generate`, {
    count: 3,
    outputDir: fixtureDir
  });
  const ingested = await postJson(`${baseUrl}/ingest/scan`, { inputDir: fixtureDir });
  const search = await getJson(`${baseUrl}/images/search?aiResult=FAIL&page=1&pageSize=5`);
  if (!search.items.length) {
    throw new Error("search returned no items");
  }

  const id = search.items[0].id;
  const metadata = await getJson(`${baseUrl}/images/${id}/metadata`);
  const image = await fetch(`${baseUrl}/images/${id}`);
  const imageBytes = await image.arrayBuffer();

  console.log(
    JSON.stringify(
      {
        generated: generated.count,
        ingested,
        metadata: {
          id: metadata.id,
          productNo: metadata.meta.productNo,
          result: metadata.tag.result ?? metadata.tag.aiResult
        },
        imageBytes: imageBytes.byteLength
      },
      null,
      2
    )
  );
} finally {
  server.close();
  await once(server, "close");
}

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

async function resetDirectory(targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
}
