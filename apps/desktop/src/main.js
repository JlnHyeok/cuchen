import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

const backendBaseUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:3000";
const htmlPath = path.join(app.getAppPath(), "src", "index.html");

function createWindow() {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: "#f5f7fb",
    title: "Cuchen Viewer",
    webPreferences: {
      preload: path.join(app.getAppPath(), "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  void window.loadFile(htmlPath);
}

app.whenReady().then(() => {
  ipcMain.handle("viewer:list-images", async (_event, query = {}) => {
    return requestJson("/images/search", query);
  });

  ipcMain.handle("viewer:search", async (_event, query = {}) => {
    return requestJson("/images/search", query);
  });

  ipcMain.handle("viewer:list-buckets", async () => {
    return requestJson("/images/buckets");
  });

  ipcMain.handle("viewer:health", async () => {
    return requestJson("/health");
  });

  ipcMain.handle("viewer:get-metadata", async (_event, imageId) => {
    return requestJson(`/images/${encodeURIComponent(imageId)}/metadata`);
  });

  ipcMain.handle("viewer:get-image-data-url", async (_event, imageId) => {
    const response = await fetch(new URL(`/images/${encodeURIComponent(imageId)}/blob`, backendBaseUrl));
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(await readErrorMessage(response, "이미지 미리보기에 실패했습니다."));
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "image/png";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  });

  ipcMain.handle("viewer:get-image-url", async (_event, imageId) => {
    return new URL(`/images/${encodeURIComponent(imageId)}/blob`, backendBaseUrl).toString();
  });

  ipcMain.handle("viewer:get-thumbnail-url", async (_event, imageId) => {
    return new URL(`/images/${encodeURIComponent(imageId)}/thumbnail`, backendBaseUrl).toString();
  });

  ipcMain.handle("viewer:save-image", async (_event, imageId, targetPathOrOptions = {}) => {
    const options =
      typeof targetPathOrOptions === "string"
        ? { targetPath: targetPathOrOptions }
        : targetPathOrOptions ?? {};
    return saveSingleImage(imageId, options);
  });

  ipcMain.handle("viewer:save-images", async (_event, imageIds = [], targetPathOrOptions = {}) => {
    const options =
      typeof targetPathOrOptions === "string"
        ? { targetDirectory: targetPathOrOptions }
        : targetPathOrOptions ?? {};
    return saveMultipleImages(imageIds, options);
  });

  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

async function requestJson(pathname, query = {}) {
  const url = new URL(pathname, backendBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Request failed for ${pathname}`));
  }

  const payload = await response.json();
  if (isApiEnvelope(payload)) {
    return payload.data;
  }
  return payload;
}

async function saveSingleImage(imageId, options = {}) {
  const response = await fetch(new URL(`/images/${encodeURIComponent(imageId)}/download`, backendBaseUrl));
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "이미지 저장에 실패했습니다."));
  }

  let targetPath = options.targetPath || null;
  if (!targetPath) {
    const saveResult = await dialog.showSaveDialog({
      title: "Save image",
      defaultPath: options.suggestedName || `${imageId}.png`,
      filters: [{ name: "PNG image", extensions: ["png"] }]
    });
    if (saveResult.canceled || !saveResult.filePath) {
      return { ok: false, canceled: true };
    }
    targetPath = saveResult.filePath;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, buffer);
  return { ok: true, filePath: targetPath };
}

async function saveMultipleImages(imageIds, options = {}) {
  const ids = Array.from(new Set((Array.isArray(imageIds) ? imageIds : []).filter(Boolean)));
  if (!ids.length) {
    return { ok: false, canceled: true, saved: [] };
  }

  let targetDirectory = options.targetDirectory || process.env.TEST_DOWNLOAD_DIR || null;
  if (!targetDirectory) {
    const directoryResult = await dialog.showOpenDialog({
      title: "Select download folder",
      properties: ["openDirectory", "createDirectory"]
    });
    if (directoryResult.canceled || !directoryResult.filePaths?.[0]) {
      return { ok: false, canceled: true, saved: [] };
    }
    targetDirectory = directoryResult.filePaths[0];
  }

  await fs.mkdir(targetDirectory, { recursive: true });
  const saved = [];
  for (const imageId of ids) {
    const record = await requestJson(`/images/${encodeURIComponent(imageId)}/metadata`);
    const response = await fetch(new URL(`/images/${encodeURIComponent(imageId)}/download`, backendBaseUrl));
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `이미지 저장에 실패했습니다: ${imageId}`));
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const fileName = buildDownloadNameFromRecord(record, imageId);
    const targetPath = await uniqueTargetPath(targetDirectory, fileName);
    await fs.writeFile(targetPath, buffer);
    saved.push({ imageId, filePath: targetPath });
  }

  return { ok: true, targetDirectory, saved };
}

function buildDownloadNameFromRecord(record, imageId) {
  const base = record?.fileName || record?.baseName || imageId || "image";
  const ext = record?.fileExt ? `.${record.fileExt}` : ".png";
  return `${base}${ext}`;
}

async function uniqueTargetPath(directory, fileName) {
  const parsed = path.parse(fileName);
  let targetPath = path.join(directory, fileName);
  let suffix = 1;
  while (true) {
    try {
      await fs.access(targetPath);
      targetPath = path.join(directory, `${parsed.name}-${suffix}${parsed.ext}`);
      suffix += 1;
    } catch {
      return targetPath;
    }
  }
}

async function readErrorMessage(response, fallbackMessage) {
  const raw = await response.text();
  if (!raw) {
    return fallbackMessage;
  }

  try {
    const payload = JSON.parse(raw);
    if (payload && typeof payload === "object") {
      if (typeof payload.errorMessage === "string" && payload.errorMessage) {
        return payload.errorMessage;
      }
      if (typeof payload.error === "string" && payload.error) {
        return payload.error;
      }
    }
  } catch {
    return raw;
  }

  return fallbackMessage;
}

function isApiEnvelope(payload) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "success" in payload &&
      "message" in payload &&
      "data" in payload &&
      "errorCode" in payload &&
      "errorMessage" in payload
  );
}
