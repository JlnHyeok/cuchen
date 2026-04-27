import crypto from "node:crypto";

export function sha1Hex(input) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hmacSha256(key, value, encoding = undefined) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

export function createStableId(baseName, imageBuffer, rawJsonBuffer) {
  const digest = sha1Hex(
    Buffer.concat([
      Buffer.from(baseName, "utf8"),
      Buffer.from("::", "utf8"),
      imageBuffer,
      Buffer.from("::", "utf8"),
      rawJsonBuffer
    ])
  );
  return `${sanitizeBaseName(baseName)}-${digest.slice(0, 12)}`;
}

export function sanitizeBaseName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "image";
}
