export function buildSingleMarksheetUrl(examSessionId: number, studentId: number): string {
  return `/api/marksheets/single?examSessionId=${examSessionId}&studentId=${studentId}`;
}

export function buildBulkMarksheetUrl(examSessionId: number, studentIds: number[]): string {
  return `/api/marksheets/bulk?examSessionId=${examSessionId}&studentIds=${studentIds.join(",")}`;
}
