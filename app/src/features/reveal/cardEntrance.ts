/** Tokenized completion prevents old animation callbacks from finishing a newer entrance. */
export class CardEntranceCompletion {
  private generation = 0;
  private resolve: (() => void) | null = null;
  begin(): { token: number; completed: Promise<void> } {
    this.cancel();
    const token = ++this.generation;
    return { token, completed: new Promise((resolve) => { this.resolve = resolve; }) };
  }
  finish(token: number): void {
    if (token !== this.generation) return;
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.();
  }
  cancel(): void {
    this.finish(this.generation);
    this.generation += 1;
  }
  get token(): number { return this.generation; }
}
