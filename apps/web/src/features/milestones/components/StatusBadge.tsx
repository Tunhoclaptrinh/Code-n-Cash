import { useTranslation } from "react-i18next";
import { ToneTag, type Tone } from "@/shared/ui/ToneTag";
import type { DecisionCode, MilestoneStatus } from "../types";

const tones: Record<MilestoneStatus, Tone> = {
  NOT_OPEN: "neutral",
  NOT_DUE: "neutral",
  AWAITING_EVIDENCE: "primary",
  AWAITING_APPROVAL: "primary",
  RELEASE: "success",
  PENALTY: "warning",
  HOLD: "warning",
  REJECT: "danger",
};

export function toneOfDecision(code: DecisionCode): Tone {
  return tones[code];
}

/** Milestone status or decision code as a coloured tag; the label is translated at render time. */
export function StatusBadge({ status }: { status: MilestoneStatus }) {
  const { t } = useTranslation("milestones");
  return <ToneTag tone={tones[status]}>{t(`status.${status}`)}</ToneTag>;
}
