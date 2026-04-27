import { InMemoryObjectStore, MinioObjectStore } from "./objectStore.js";

export function createStore(config, mode = process.env.STORAGE_MODE || "minio") {
  if (mode === "memory") {
    return new InMemoryObjectStore();
  }
  return new MinioObjectStore(config);
}
