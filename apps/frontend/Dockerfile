FROM node:22-bookworm-slim AS build

WORKDIR /app

ENV CI=true

COPY package.json package-lock.json ./
RUN npm ci

COPY svelte.config.js tsconfig.json vite.config.ts ./
COPY .env* ./
COPY src ./src

RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=4173

COPY --from=build /app/build ./build
RUN printf '%s\n' \
  'import { createReadStream, statSync } from "node:fs";' \
  'import { extname, join, normalize } from "node:path";' \
  'import { createServer } from "node:http";' \
  '' \
  'const root = join(process.cwd(), "build");' \
  'const host = process.env.HOST || "0.0.0.0";' \
  'const port = Number.parseInt(process.env.PORT || "4173", 10);' \
  'const types = new Map([[".css", "text/css"], [".html", "text/html"], [".js", "text/javascript"], [".json", "application/json"], [".svg", "image/svg+xml"], [".webp", "image/webp"], [".woff2", "font/woff2"]]);' \
  '' \
  'createServer((request, response) => {' \
  '  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);' \
  '  const requestPath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");' \
  '  let filePath = join(root, requestPath);' \
  '  try {' \
  '    const stat = statSync(filePath);' \
  '    if (stat.isDirectory()) filePath = join(filePath, "index.html");' \
  '  } catch {' \
  '    filePath = join(root, "index.html");' \
  '  }' \
  '  response.setHeader("Content-Type", types.get(extname(filePath)) || "application/octet-stream");' \
  '  createReadStream(filePath).pipe(response);' \
  '}).listen(port, host, () => console.log(`[frontend] listening on http://${host}:${port}`));' \
  > server.mjs

USER node

EXPOSE 4173

CMD ["node", "server.mjs"]
