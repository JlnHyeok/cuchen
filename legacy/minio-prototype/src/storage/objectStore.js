import { S3Client } from "./s3Client.js";

const MANIFEST_KEY = "manifests/catalog.json";

export class MinioObjectStore {
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

  async recordExists(recordKey) {
    return this.client.headObject(this.bucket, recordKey);
  }

  async putImage(imageKey, body) {
    await this.client.putObject(this.bucket, imageKey, body, "image/png");
  }

  async putRawJson(rawJsonKey, body) {
    await this.client.putObject(this.bucket, rawJsonKey, body, "application/json; charset=utf-8");
  }

  async putRecord(recordKey, record) {
    await this.client.putJson(this.bucket, recordKey, record);
  }

  async getRecord(recordKey) {
    return this.client.getJson(this.bucket, recordKey);
  }

  async getImage(imageKey) {
    return this.client.getNodeStream(this.bucket, imageKey);
  }

  async loadManifest() {
    return this.client.getJson(this.bucket, MANIFEST_KEY);
  }

  async saveManifest(manifest) {
    await this.client.putJson(this.bucket, MANIFEST_KEY, manifest);
  }
}

export class InMemoryObjectStore {
  constructor() {
    this.objects = new Map();
    this.manifest = null;
  }

  async init() {}

  async recordExists(recordKey) {
    return this.objects.has(recordKey);
  }

  async putImage(imageKey, body) {
    this.objects.set(imageKey, { body: Buffer.from(body), contentType: "image/png" });
  }

  async putRawJson(rawJsonKey, body) {
    this.objects.set(rawJsonKey, { body: Buffer.from(body), contentType: "application/json" });
  }

  async putRecord(recordKey, record) {
    this.objects.set(recordKey, { body: Buffer.from(JSON.stringify(record)), contentType: "application/json" });
  }

  async getRecord(recordKey) {
    const value = this.objects.get(recordKey);
    return value ? JSON.parse(value.body.toString("utf8")) : null;
  }

  async getImage(imageKey) {
    const value = this.objects.get(imageKey);
    if (!value) {
      return null;
    }
    return {
      headers: new Headers({ "content-type": value.contentType }),
      stream: ReadableFromBuffer(value.body)
    };
  }

  async loadManifest() {
    return this.manifest;
  }

  async saveManifest(manifest) {
    this.manifest = structuredClone(manifest);
  }
}

function ReadableFromBuffer(buffer) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    }
  });
}
