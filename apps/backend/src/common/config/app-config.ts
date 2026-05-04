import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AppConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  storageMode: "memory" | "mongo-minio";
  ingestRootDir: string;
  testIoDelayMs: number;
  minioEndpoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioBucket: string;
  mongoUri: string;
  mongoDbName: string;
  mongoCollectionName: string;
}

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadAppConfig(): AppConfig {
  const appDir = path.dirname(fileURLToPath(import.meta.url));
  const backendRootDir = path.resolve(appDir, "../../..");
  const resolveBackendPath = (value: string | undefined, fallback: string): string => {
    const target = value ?? fallback;
    return path.isAbsolute(target) ? target : path.resolve(backendRootDir, target);
  };

  const mongoUrl = process.env.MONGODB_URL ?? process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017";
  const mongoDbName = process.env.MONGODB_DATABASE_NAME ?? process.env.MONGO_DB_NAME ?? "cuchen";
  const mongoUser = process.env.MONGODB_USER ?? process.env.MONGO_USER ?? "";
  const mongoPassword = process.env.MONGODB_PASSWORD ?? process.env.MONGO_PASSWORD ?? "";
  const mongoAuthSource = process.env.MONGODB_AUTH_SOURCE ?? process.env.MONGO_AUTH_SOURCE ?? "admin";

  return {
    port: toNumber(process.env.PORT, 3000),
    host: process.env.HOST ?? "0.0.0.0",
    corsOrigins: splitList(process.env.CORS_ORIGIN),
    storageMode: process.env.STORAGE_MODE === "mongo-minio" ? "mongo-minio" : "memory",
    ingestRootDir: resolveBackendPath(process.env.INGEST_ROOT_DIR, "generated/inbox"),
    testIoDelayMs: toNumber(process.env.TEST_IO_DELAY_MS, 0),
    minioEndpoint: process.env.MINIO_ENDPOINT ?? "http://127.0.0.1:9000",
    minioAccessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
    minioSecretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
    minioBucket: process.env.MINIO_BUCKET ?? "cuchen-images",
    mongoUri: buildMongoUri(mongoUrl, mongoDbName, mongoUser, mongoPassword, mongoAuthSource),
    mongoDbName,
    mongoCollectionName: process.env.MONGO_COLLECTION_NAME ?? "catalog"
  };
}

function buildMongoUri(baseUrl: string, databaseName: string, user: string, password: string, authSource: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName.replace(/^\/+|\/+$/g, "")}`;

  if (user) {
    url.username = user;
  }
  if (password) {
    url.password = password;
  }
  if (user && !url.searchParams.has("authSource")) {
    url.searchParams.set("authSource", authSource || "admin");
  }

  return url.toString();
}
