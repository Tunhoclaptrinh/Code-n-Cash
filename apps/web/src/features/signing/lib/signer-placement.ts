import type {
  SigningConfig,
  SignatureSlot,
  SignStepView,
} from "@codecash/contracts";
const normalized = (name: string) =>
  name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
export function printedAreas(config: SigningConfig, step: SignStepView) {
  return config.previewPages.flatMap((page) =>
    (page.anchors ?? [])
      .filter(
        (anchor) =>
          anchor.signerName &&
          normalized(anchor.signerName) === normalized(step.signerName) &&
          anchor.party === step.party,
      )
      .map((anchor) => ({ ...anchor, page: page.pageNo })),
  );
}
export function wrongSignerArea(
  config: SigningConfig,
  step: SignStepView,
  slot?: SignatureSlot | null,
) {
  if (
    !config.previewPages.some((page) =>
      page.anchors?.some((anchor) => anchor.signerName),
    )
  )
    return false;
  const areas = printedAreas(config, step);
  return (
    !areas.length ||
    (!!slot &&
      !areas.some(
        (area) =>
          area.page === slot.page &&
          slot.x >= area.x - 1 &&
          slot.y >= area.y - 1 &&
          slot.x + slot.w <= area.x + (area.w ?? 240) + 1 &&
          slot.y + slot.h <= area.y + (area.h ?? 92) + 1,
      ))
  );
}
