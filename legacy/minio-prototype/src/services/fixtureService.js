import fs from "node:fs/promises";
import path from "node:path";
import { createFixturePng } from "../utils/png.js";

const AI_RESULTS = ["PASS", "FAIL", "REVIEW"];

export class FixtureService {
  async generateFixtures({
    count,
    outputDir,
    startIndex = 1,
    imageBytes = null,
    imageMegabytes = null,
    reuseSingleImage = false
  }) {
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error("count must be a positive integer");
    }

    await fs.mkdir(outputDir, { recursive: true });
    const created = [];

    const sharedImagePath = reuseSingleImage ? path.join(outputDir, "__shared-source.png") : null;
    if (reuseSingleImage) {
      const sharedPng = createFixturePng(startIndex, {
        imageBytes,
        imageMegabytes
      });
      await fs.writeFile(sharedImagePath, sharedPng);
    }

    for (let offset = 0; offset < count; offset += 1) {
      const index = startIndex + offset;
      const baseName = `sample-${String(index).padStart(6, "0")}`;
      const imagePath = path.join(outputDir, `${baseName}.png`);
      const jsonPath = path.join(outputDir, `${baseName}.json`);
      const fixtureJson = createFixtureJson(index);

      if (reuseSingleImage) {
        await ensureLinkedImage(sharedImagePath, imagePath);
      } else {
        const png = createFixturePng(index, {
          imageBytes,
          imageMegabytes
        });
        await fs.writeFile(imagePath, png);
      }

      await fs.writeFile(jsonPath, JSON.stringify(fixtureJson, null, 2), "utf8");
      created.push({ baseName, imagePath, jsonPath });
    }

    if (reuseSingleImage && sharedImagePath) {
      await fs.rm(sharedImagePath, { force: true });
    }

    return {
      count,
      outputDir,
      startIndex,
      reuseSingleImage,
      created
    };
  }
}

function createFixtureJson(index) {
  const sequence = index - 1;
  const capturedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)).toISOString();
  const threshold = Number(((sequence * 3) % 100 / 100).toFixed(2));
  return {
    title: `sample title ${String(index).padStart(6, "0")}`,
    productNo: `PRD-${String(100000 + index)}`,
    capturedAt,
    lotNo: `LOT-${String((index % 30) + 1).padStart(3, "0")}`,
    cameraId: `CAM-${String((index % 8) + 1).padStart(2, "0")}`,
    result: AI_RESULTS[index % AI_RESULTS.length],
    threshold,
    inspectorModel: `vision-v${(index % 4) + 1}`,
    inspectedAt: new Date(Date.parse(capturedAt) + 3000).toISOString()
  };
}

async function ensureLinkedImage(sourcePath, targetPath) {
  await fs.rm(targetPath, { force: true });

  try {
    await fs.link(sourcePath, targetPath);
    return;
  } catch (error) {
    if (error?.code === "EEXIST") {
      await fs.rm(targetPath, { force: true });
      await fs.link(sourcePath, targetPath);
      return;
    }

    if (error?.code === "EXDEV" || error?.code === "EPERM" || error?.code === "EINVAL") {
      await fs.copyFile(sourcePath, targetPath);
      return;
    }

    throw error;
  }
}
