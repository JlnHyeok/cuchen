import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { errorEnvelope } from "./api-envelope.js";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (response.headersSent) {
      return;
    }

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorMessage = extractErrorMessage(exception);

    response.status(status).json(errorEnvelope(status, errorMessage));
  }
}

function extractErrorMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const payload = exception.getResponse();
    if (typeof payload === "string") {
      return payload;
    }
    if (payload && typeof payload === "object") {
      const message = (payload as { message?: unknown }).message;
      if (Array.isArray(message)) {
        return message.map((entry) => String(entry)).join(", ");
      }
      if (typeof message === "string") {
        return message;
      }
    }
    return exception.message || "request failed";
  }

  if (exception instanceof Error) {
    return exception.message || "internal error";
  }

  return "internal error";
}
