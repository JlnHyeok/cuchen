import http from "node:http";
import { URL } from "node:url";

export function createApp({ fixtureService, ingestService, config }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const pathname = url.pathname;

      if (req.method === "GET" && pathname === "/health") {
        return writeJson(res, 200, {
          ok: true,
          minioEndpoint: config.minioEndpoint,
          bucket: config.minioBucket,
          manifest: ingestService.getManifestStats()
        });
      }

      if (req.method === "POST" && pathname === "/fixtures/generate") {
        const body = await readJsonBody(req);
        const result = await fixtureService.generateFixtures({
          count: Number(body.count),
          outputDir: body.outputDir || config.defaultFixtureDir,
          startIndex: body.startIndex ? Number(body.startIndex) : 1,
          imageBytes: body.imageBytes ?? null,
          imageMegabytes: body.imageMegabytes ?? null,
          reuseSingleImage: Boolean(body.reuseSingleImage)
        });
        return writeJson(res, 200, result);
      }

      if (req.method === "POST" && pathname === "/ingest/scan") {
        const body = await readJsonBody(req);
        const result = await ingestService.ingestDirectory(body.inputDir || config.defaultFixtureDir);
        return writeJson(res, 200, result);
      }

      if (req.method === "GET" && pathname === "/images/search") {
        const result = ingestService.search(Object.fromEntries(url.searchParams.entries()));
        return writeJson(res, 200, result);
      }

      const metadataMatch = pathname.match(/^\/images\/([^/]+)\/metadata$/);
      if (req.method === "GET" && metadataMatch) {
        const record = await ingestService.getRecord(metadataMatch[1]);
        if (!record) {
          return writeJson(res, 404, { error: "Not found" });
        }
        return writeJson(res, 200, record);
      }

      const imageMatch = pathname.match(/^\/images\/([^/]+)$/);
      if (req.method === "GET" && imageMatch) {
        const image = await ingestService.getImage(imageMatch[1]);
        if (!image) {
          return writeJson(res, 404, { error: "Not found" });
        }
        res.writeHead(200, {
          "content-type": image.headers.get("content-type") || "application/octet-stream"
        });
        if (typeof image.stream.pipe === "function") {
          image.stream.pipe(res);
          return;
        }
        const reader = image.stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          res.write(Buffer.from(value));
        }
        res.end();
        return;
      }

      writeJson(res, 404, { error: "Route not found" });
    } catch (error) {
      writeJson(res, 500, { error: error.message });
    }
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}
