/** Animation completion is independent of server confirmation. Cancellation always settles. */
export class TearCompletion {
  private resolve: (() => void) | null = null;
  begin(): Promise<void> {
    this.finish();
    return new Promise((resolve) => { this.resolve = resolve; });
  }
  finish(): void {
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.();
  }
}
