import { useEffect, useState } from "react";
import { Platform } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

/** DECISIONS: Connectivity states ONLINE | RECONNECTING | OFFLINE. */
export type ConnectivityStatus = "ONLINE" | "RECONNECTING" | "OFFLINE";

type Listener = (status: ConnectivityStatus) => void;

let current: ConnectivityStatus = "ONLINE";
let previouslyOffline = false;
const listeners = new Set<Listener>();
let started = false;

function deriveStatus(state: NetInfoState): ConnectivityStatus {
  const offline = state.isConnected === false || state.isInternetReachable === false;
  if (offline) {
    previouslyOffline = true;
    return "OFFLINE";
  }

  // Coming back from offline: native may report connected before reachability is known.
  if (previouslyOffline && Platform.OS !== "web") {
    if (state.isInternetReachable === true) {
      previouslyOffline = false;
      return "ONLINE";
    }
    if (state.isConnected === true && state.isInternetReachable === null) {
      return "RECONNECTING";
    }
  }

  previouslyOffline = false;
  return "ONLINE";
}

function publish(status: ConnectivityStatus) {
  current = status;
  listeners.forEach((listener) => listener(current));
}

function ensureSubscription() {
  if (started) {
    return;
  }
  started = true;
  void NetInfo.fetch().then((state) => {
    publish(deriveStatus(state));
  });
  NetInfo.addEventListener((state) => {
    publish(deriveStatus(state));
  });
}

/** Shared connectivity status for banners and action gating. */
export function useConnectivity(): ConnectivityStatus {
  const [status, setStatus] = useState<ConnectivityStatus>(current);

  useEffect(() => {
    ensureSubscription();
    listeners.add(setStatus);
    return () => {
      listeners.delete(setStatus);
    };
  }, []);

  return status;
}

/** True only when fully online. Financial actions stay disabled otherwise. */
export function useOnline(): boolean {
  return useConnectivity() === "ONLINE";
}
