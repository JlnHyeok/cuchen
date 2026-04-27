import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { ApiExceptionFilter } from "../src/common/http/api-exception.filter.js";
import { okEnvelope } from "../src/common/http/api-envelope.js";

test("okEnvelope wraps payload in the common JSON contract", () => {
  assert.deepEqual(okEnvelope({ buckets: ["jin-test"] }), {
    success: true,
    message: "ok",
    data: { buckets: ["jin-test"] },
    errorCode: null,
    errorMessage: null
  });
});

test("ApiExceptionFilter wraps not found exceptions in the common JSON contract", () => {
  const filter = new ApiExceptionFilter();
  let statusCode: number | null = null;
  let payload: unknown = null;
  const response = {
    headersSent: false,
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    }
  };
  const host = {
    switchToHttp() {
      return {
        getResponse() {
          return response;
        }
      };
    }
  };

  filter.catch(new NotFoundException("Image not found: sample-1"), host as never);

  assert.equal(statusCode, 404);
  assert.deepEqual(payload, {
    success: false,
    message: "request failed",
    data: null,
    errorCode: "NOT_FOUND",
    errorMessage: "Image not found: sample-1"
  });
});
