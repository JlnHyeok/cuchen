import { Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { IngestEventsService, type CatalogRealtimeEvent } from "../application/ingest-events.service.js";

@Controller("images")
export class IngestEventsController {
  constructor(private readonly ingestEvents: IngestEventsService) {}

  @Get("events")
  stream(@Req() request: Request, @Res() response: Response): void {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();
    response.write("retry: 5000\n\n");

    const unsubscribe = this.ingestEvents.subscribe((event) => {
      writeEvent(response, event);
    });
    const heartbeat = setInterval(() => {
      response.write(`event: catalog.ping\ndata: ${JSON.stringify({ occurredAt: new Date().toISOString() })}\n\n`);
    }, 25000);

    request.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  }
}

function writeEvent(response: Response, event: CatalogRealtimeEvent): void {
  response.write(`event: ${event.type}\n`);
  response.write(`id: ${event.sequence}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}
