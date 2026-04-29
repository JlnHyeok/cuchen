import { Injectable } from "@nestjs/common";
import type { CatalogRecord } from "../../shared.js";

export const CATALOG_RECORD_SYNCED_EVENT = "catalog.record.synced";

export interface CatalogRecordSyncedEvent {
  type: typeof CATALOG_RECORD_SYNCED_EVENT;
  sequence: number;
  occurredAt: string;
  record: {
    imageId: string;
    productId: string | null;
    div: string | null;
    result: string | null;
    version: string | null;
    updatedAt: string;
  };
}

export type CatalogRealtimeEvent = CatalogRecordSyncedEvent;
type CatalogRealtimeListener = (event: CatalogRealtimeEvent) => void;

@Injectable()
export class IngestEventsService {
  private readonly listeners = new Set<CatalogRealtimeListener>();
  private sequence = 0;

  subscribe(listener: CatalogRealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publishRecordSynced(record: CatalogRecord): void {
    this.sequence += 1;
    this.publish({
      type: CATALOG_RECORD_SYNCED_EVENT,
      sequence: this.sequence,
      occurredAt: new Date().toISOString(),
      record: {
        imageId: record.imageId,
        productId: readText(record.metadata.productId) ?? null,
        div: readText(record.metadata.div) ?? null,
        result: readText(record.metadata.result) ?? null,
        version: readText(record.metadata.version) ?? null,
        updatedAt: record.updatedAt
      }
    });
  }

  private publish(event: CatalogRealtimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function readText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
