import { getConfig } from "./config.js";
import { createApp } from "./app.js";
import { FixtureService } from "./services/fixtureService.js";
import { IngestService } from "./services/ingestService.js";
import { createStore } from "./storage/createStore.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

export async function startServer(overrideConfig = getConfig()) {
  const fixtureService = new FixtureService();
  const store = createStore(overrideConfig);
  const ingestService = new IngestService({
    store,
    concurrency: overrideConfig.ingestConcurrency
  });

  await ingestService.init();

  const server = createApp({ fixtureService, ingestService, config: overrideConfig });
  const { port } = await listen(server, overrideConfig.appPort, "127.0.0.1");

  return {
    server,
    fixtureService,
    ingestService,
    config: overrideConfig,
    port,
    baseUrl: `http://127.0.0.1:${port}`
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const runtime = await startServer();
  console.log(`Listening on ${runtime.baseUrl}`);
}

function listen(server, preferredPort, host) {
  return new Promise((resolve, reject) => {
    const attemptListen = (port) => {
      const onError = (error) => {
        server.off("listening", onListening);
        if (error?.code === "EADDRINUSE" && port !== 0) {
          attemptListen(0);
          return;
        }
        reject(error);
      };

      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        const actualPort = typeof address === "object" && address ? address.port : port;
        resolve({ port: actualPort });
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    };

    attemptListen(preferredPort);
  });
}
