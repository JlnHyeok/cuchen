const byteFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 1
});

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '-';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${byteFormatter.format(bytes / 1024)} KB`;
  }

  return `${byteFormatter.format(bytes / (1024 * 1024))} MB`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}
