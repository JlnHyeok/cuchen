import assert from "node:assert/strict";
import test from "node:test";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { RequestLoggingInterceptor } from "../src/common/http/request-logging.interceptor.js";

test("request logging interceptor logs completed HTTP requests", async () => {
  const messages: string[] = [];
  const interceptor = new RequestLoggingInterceptor(new TestLogger(messages));

  const context = createHttpContext("GET", "/images/search", 200);
  const result = await lastValueFrom(interceptor.intercept(context, { handle: () => of({ ok: true }) }));

  assert.deepEqual(result, { ok: true });
  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /\[api\] GET \/images\/search status=200 durationMs=\d+/);
});

test("request logging interceptor logs failed HTTP requests", async () => {
  const messages: string[] = [];
  const interceptor = new RequestLoggingInterceptor(new TestLogger(messages));
  const error = new Error("boom");

  const context = createHttpContext("POST", "/ingest/scan", 500);
  await assert.rejects(
    () => lastValueFrom(interceptor.intercept(context, { handle: () => throwError(() => error) })),
    /boom/
  );

  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /\[api\] POST \/ingest\/scan status=500 durationMs=\d+ error=boom/);
});

function createHttpContext(method: string, originalUrl: string, statusCode: number): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, originalUrl }),
      getResponse: () => ({ statusCode })
    })
  } as ExecutionContext;
}

class TestLogger {
  constructor(private readonly messages: string[]) {}

  log(message: string): void {
    this.messages.push(message);
  }

  warn(message: string): void {
    this.messages.push(message);
  }
}
