const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  },
});

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const { isInflightCheckout } = await import("../app/src/api/checkout.ts");
  const saved = {
    cartId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "phase21-pay-same-key",
    expectedTotalCents: "1000",
    lines: [{ lineId: "22222222-2222-4222-8222-222222222222", quantity: 1, snapshotPriceCents: "1000" }],
  };

  assert(isInflightCheckout(saved), "a stored payment was dropped");
  assert(isInflightCheckout({ ...saved, lines: [] }), "a payment with no lines was dropped");
  assert(!isInflightCheckout({ ...saved, idempotencyKey: 12 }), "a payment without a key was kept");
  assert(!isInflightCheckout(null), "an empty store was a payment");
  assert(
    !isInflightCheckout({ ...saved, lines: [{ lineId: "x", quantity: "1", snapshotPriceCents: "1000" }] }),
    "a payment with a bad quantity was kept",
  );
  console.log("CHECKOUT_RESUME_OK");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
