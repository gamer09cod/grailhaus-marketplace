import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";

import { watchTables } from "../../api/live";
import { secondsUntil } from "../cart/countdown";
import { loadDropBoard, type DropBoard } from "./board";

export function useDropBoard() {
  const queryClient = useQueryClient();
  const boundaryKey = useRef<string | null>(null);
  const board = useQuery({
    queryKey: ["drop-board"],
    queryFn: loadDropBoard,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["drop-board"] });
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        refresh();
      }
    });
    const stop = watchTables("drop-stock", [{ table: "pack_skus" }, { table: "drops" }], refresh);
    return () => {
      appState.remove();
      stop();
    };
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      const nextNow = Date.now();
      if (board.data && boundaryReached(board.data, nextNow) && boundaryKey.current !== board.data.serverNow) {
        boundaryKey.current = board.data.serverNow;
        refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [board.data, refresh]);

  return board;
}

export function boundaryReached(board: DropBoard, nowMs: number): boolean {
  return board.drops.some((drop) => {
    const target = drop.status === "UPCOMING" ? drop.startsAt : drop.status === "LIVE" ? drop.endsAt : null;
    if (!target) {
      return false;
    }
    return secondsUntil(target, board.serverNow, board.fetchedAtMs, nowMs) === 0;
  });
}
