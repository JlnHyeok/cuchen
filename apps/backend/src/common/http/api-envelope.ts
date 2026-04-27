export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export function okEnvelope<T>(data: T, message = "ok"): ApiEnvelope<T> {
  return {
    success: true,
    message,
    data,
    errorCode: null,
    errorMessage: null
  };
}

export function errorEnvelope(status: number, errorMessage: string, message = "request failed"): ApiEnvelope<null> {
  return {
    success: false,
    message,
    data: null,
    errorCode: statusToErrorCode(status),
    errorMessage
  };
}

export function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    typeof (value as { success?: unknown }).success === "boolean" &&
    typeof (value as { message?: unknown }).message === "string" &&
    Object.prototype.hasOwnProperty.call(value, "data") &&
    Object.prototype.hasOwnProperty.call(value, "errorCode") &&
    Object.prototype.hasOwnProperty.call(value, "errorMessage")
  );
}

function statusToErrorCode(status: number): string {
  switch (status) {
    case 400:
      return "VALIDATION_ERROR";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    default:
      return "INTERNAL_ERROR";
  }
}
