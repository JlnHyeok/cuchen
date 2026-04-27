import path from "node:path";
import { loadEnvFile } from "./utils/env.js";

loadEnvFile(process.cwd());

export function getConfig() {
  return {
    appPort: Number.parseInt(process.env.APP_PORT || "3000", 10),
    minioEndpoint: process.env.MINIO_ENDPOINT || "http://192.168.1.92:9000",
    minioAccessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    minioSecretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    minioBucket: process.env.MINIO_BUCKET || "image-catalog",
    defaultFixtureDir: path.resolve(
      process.cwd(),
      process.env.DEFAULT_FIXTURE_DIR || "./generated/fixtures"
    ),
    benchmarkReportDir: path.resolve(
      process.cwd(),
      process.env.BENCHMARK_REPORT_DIR || "./artifacts/reports"
    ),
    ingestConcurrency: Number.parseInt(process.env.INGEST_CONCURRENCY || "8", 10),
    region: process.env.MINIO_REGION || "us-east-1"
  };
}
