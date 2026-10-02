export function remainingLabel(expiresAt: string, serverNow: string, fetchedAtMs: number, nowMs: number): string {
  const offset = Date.parse(serverNow) - fetchedAtMs;
  const remainingMs = Date.parse(expiresAt) - (nowMs + offset);
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Reserved for ${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function holdHasEnded(expiresAt: string, serverNow: string, fetchedAtMs: number, nowMs: number): boolean {
  const offset = Date.parse(serverNow) - fetchedAtMs;
  return Date.parse(expiresAt) - (nowMs + offset) <= 0;
}
