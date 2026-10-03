export function serverInstantMs(serverNow: string, fetchedAtMs: number, nowMs: number): number {
  return nowMs + (Date.parse(serverNow) - fetchedAtMs);
}

export function secondsUntil(targetIso: string, serverNow: string, fetchedAtMs: number, nowMs: number): number {
  const remainingMs = Date.parse(targetIso) - serverInstantMs(serverNow, fetchedAtMs, nowMs);
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function clockLabel(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  return [hours, minutes, remain].map((part) => part.toString().padStart(2, "0")).join(":");
}

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
