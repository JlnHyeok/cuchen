import { S3Client } from "./s3Client.js";

export class MinioNativeObjectStore {
  constructor(config) {
    this.bucket = config.minioBucket;
    this.client = new S3Client({
      endpoint: config.minioEndpoint,
      accessKey: config.minioAccessKey,
      secretKey: config.minioSecretKey,
      region: config.region
    });
  }

  async init() {
    await this.client.ensureBucket(this.bucket);
  }

  async putImageWithContext(imageKey, imageBuffer, { meta = {}, tag = {} } = {}) {
    await this.client.putObjectWithContext(this.bucket, imageKey, imageBuffer, {
      contentType: "image/png",
      metadata: meta,
      tags: tag
    });
  }

  async getImage(imageKey) {
    return this.client.getNodeStream(this.bucket, imageKey);
  }

  async getMetadataHeaders(imageKey) {
    return this.client.headObjectHeaders(this.bucket, imageKey);
  }

  async getTags(imageKey) {
    return this.client.getObjectTagging(this.bucket, imageKey);
  }
}
