import { CallHandler, ExecutionContext, HttpException, Inject, Injectable, Logger, NestInterceptor, Optional } from "@nestjs/common";
import type { Request, Response } from "express";
import { catchError, tap, type Observable } from "rxjs";

interface RequestLogger {
  log(message: string): void;
  warn(message: string): void;
}

export const REQUEST_LOGGER = Symbol("REQUEST_LOGGER");

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger: RequestLogger;

  constructor(@Optional() @Inject(REQUEST_LOGGER) logger?: RequestLogger) {
    this.logger = logger ?? new Logger(RequestLoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method;
    const path = request.originalUrl || request.url;

    return next.handle().pipe(
      tap(() => {
        this.logger.log(`[api] ${method} ${path} status=${response.statusCode} durationMs=${Date.now() - startedAt}`);
      }),
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : response.statusCode || 500;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[api] ${method} ${path} status=${status} durationMs=${Date.now() - startedAt} error=${message}`);
        throw error;
      })
    );
  }
}
