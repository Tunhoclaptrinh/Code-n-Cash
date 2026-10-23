import type { SignMethod } from "../types";

export type MethodKind = "USB" | "REMOTE" | "IMAGE";

/** Methods in the order they are offered. */
export const SIGN_METHODS: readonly SignMethod[] = [
  "USB_TOKEN",
  "VNPT_SMARTCA",
  "VIETTEL_MYSIGN",
  "IMAGE",
];

export function methodKind(method: SignMethod): MethodKind {
  if (method === "USB_TOKEN") return "USB";
  if (method === "IMAGE") return "IMAGE";
  return "REMOTE";
}
