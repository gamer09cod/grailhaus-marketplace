export function serverInstantMs(serverNow: string, fetchedAtMs: number, nowMs: number): number {
  return nowMs + (Date.parse(serverNow) - fetchedAtMs);
}

export function secondsUntil(targetIso: string, serverNow: string, fetchedAtMs: number, nowMs: number): number {
  const remainingMs = Date.parse(targetIso) - serverInstantMs(serverNow, fetchedAtMs, nowMs);
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function clockLabel(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  const clock = [hours, minutes, remain].map((part) => part.toString().padStart(2, "0")).join(":");
  if (days > 0) {
    return `${days}d ${clock}`;
  }
  const totalHours = Math.floor(seconds / 3600);
  return [totalHours, minutes, remain].map((part) => part.toString().padStart(2, "0")).join(":");
}

export const HOLD_EXPIRING_SECONDS = 60;

export function remainingLabel(expiresAt: string, serverNow: string, fetchedAtMs: number, nowMs: number): string {
  const totalSeconds = secondsUntil(expiresAt, serverNow, fetchedAtMs, nowMs);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Reserved for ${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function isHoldExpiring(expiresAt: string, serverNow: string, fetchedAtMs: number, nowMs: number): boolean {
  const left = secondsUntil(expiresAt, serverNow, fetchedAtMs, nowMs);
  return left > 0 && left <= HOLD_EXPIRING_SECONDS;
}

export function holdHasEnded(expiresAt: string, serverNow: string, fetchedAtMs: number, nowMs: number): boolean {
  const offset = Date.parse(serverNow) - fetchedAtMs;
  return Date.parse(expiresAt) - (nowMs + offset) <= 0;
}
