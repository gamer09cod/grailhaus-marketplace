/** Tap acceleration applies once to remaining presentation time, never to settlement. */
export function remainingSuspenseMs(durationMs: number, progress: number): number {
  "worklet";
  return Math.max(1, durationMs * (1 - Math.max(0, Math.min(1, progress))) * 0.35);
}
export const FINAL_REVEAL_BEAT_MS = 650;

/** Tokenized animation completion; cancellation cannot masquerade as completion. */
export class SuspenseCompletion {
  private generation = 0;
  private resolve: ((completed: boolean) => void) | null = null;
  begin(): { token: number; completed: Promise<boolean> } {
    this.cancel();
    const token = ++this.generation;
    return { token, completed: new Promise((resolve) => { this.resolve = resolve; }) };
  }
  finish(token: number): void {
    if (token !== this.generation) return;
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.(true);
  }
  cancel(): void {
    const resolve = this.resolve;
    this.resolve = null;
    this.generation += 1;
    resolve?.(false);
  }
  get token(): number { return this.generation; }
}
