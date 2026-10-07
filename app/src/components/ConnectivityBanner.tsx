import { InlineStatusCard } from "./InlineStatusCard";
import { useConnectivity } from "../features/shelf/useOnline";

type ConnectivityBannerProps = {
  /**
   * Screen-specific offline detail (EDGE_CASES copy).
   * Reconnecting uses a shared stale-snapshot line.
   */
  offlineDetail: string;
};

/** Persistent connectivity notice. Hidden while ONLINE. */
export function ConnectivityBanner({ offlineDetail }: ConnectivityBannerProps) {
  const status = useConnectivity();

  if (status === "ONLINE") {
    return null;
  }

  if (status === "RECONNECTING") {
    return (
      <InlineStatusCard
        body="Showing the last snapshot. It may be out of date."
        icon="sync-outline"
        title="Reconnecting…"
        tone="info"
      />
    );
  }

  return (
    <InlineStatusCard
      body={offlineDetail}
      icon="cloud-offline-outline"
      title="You're offline."
      tone="warning"
    />
  );
}
