import shared from "../components/shared.module.css";

/** Colour family of a sign step; steps beyond the palette reuse it in turn. */
export function toneClass(stepNo: number): string {
  return stepNo % 2 === 1 ? shared.tone1 : shared.tone2;
}
