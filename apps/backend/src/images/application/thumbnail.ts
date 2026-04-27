import sharp from "sharp";

export const THUMBNAIL_CONTENT_TYPE = "image/webp";
export const THUMBNAIL_MAX_SIZE = 512;
export const THUMBNAIL_WEBP_QUALITY = 76;

export function createThumbnailBuffer(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .rotate()
    .resize({ width: THUMBNAIL_MAX_SIZE, height: THUMBNAIL_MAX_SIZE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: THUMBNAIL_WEBP_QUALITY })
    .toBuffer();
}
