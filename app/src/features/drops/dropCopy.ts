import type { DropStatus } from "./board";

export function dropCtaLabel(status: DropStatus): string {
  if (status === "LIVE") {
    return "Reserve Pack";
  }
  if (status === "UPCOMING") {
    return "View Drop";
  }
  if (status === "SOLD_OUT") {
    return "Browse Similar Packs";
  }
  return "Browse Packs";
}

export function dropStatusTitle(status: DropStatus): string {
  if (status === "LIVE") {
    return "LIVE";
  }
  if (status === "UPCOMING") {
    return "Starts in";
  }
  if (status === "SOLD_OUT") {
    return "Sold out";
  }
  return "Drop ended";
}

export function dropClosedCopy(status: Exclude<DropStatus, "LIVE">): string {
  if (status === "UPCOMING") {
    return "That drop is not open.";
  }
  if (status === "SOLD_OUT") {
    return "Sold out. None of these packs are left to reserve.";
  }
  return "That drop has ended.";
}
