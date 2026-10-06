import { supabase } from "./supabase";

type LiveWatch = {
  table: string;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  filter?: string;
};

/** One channel per mount. A burst of row changes refreshes once. */
export function watchTables(label: string, watches: LiveWatch[], onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const channel = supabase.channel(`${label}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`);
  for (const watch of watches) {
    const change: {
      event: "*" | "INSERT" | "UPDATE" | "DELETE";
      schema: "public";
      table: string;
      filter?: string;
    } = {
      event: watch.event ?? "*",
      schema: "public",
      table: watch.table,
    };
    if (watch.filter) {
      change.filter = watch.filter;
    }
    channel.on(
      "postgres_changes",
      change,
      () => {
        if (timer !== null) {
          return;
        }
        timer = setTimeout(() => {
          timer = null;
          onChange();
        }, 40);
      },
    );
  }
  channel.subscribe();
  return () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    void supabase.removeChannel(channel);
  };
}
