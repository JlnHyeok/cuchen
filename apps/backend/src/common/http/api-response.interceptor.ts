import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Response } from "express";
import { map, type Observable } from "rxjs";
import { isApiEnvelope, okEnvelope } from "./api-envelope.js";

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        if (response.headersSent || response.writableEnded || isApiEnvelope(data)) {
          return data;
        }

        return okEnvelope(data ?? null);
      })
    );
  }
}
