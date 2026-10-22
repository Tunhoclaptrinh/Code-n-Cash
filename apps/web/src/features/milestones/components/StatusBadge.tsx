import { useTranslation } from "react-i18next";
import type { DecisionCode, MilestoneStatus } from "../types";
import { Badge, type BadgeSize, type BadgeTone } from "./Badge";

const tones: Record<MilestoneStatus, BadgeTone> = {
  NOT_OPEN: "neutral",
  NOT_DUE: "neutral",
  AWAITING_EVIDENCE: "primary",
  AWAITING_APPROVAL: "primary",
  RELEASE: "success",
  PENALTY: "warning",
  HOLD: "warning",
  REJECT: "danger",
};

export function toneOfDecision(code: DecisionCode): BadgeTone {
  return tones[code];
}

interface StatusBadgeProps {
  status: MilestoneStatus;
  size?: BadgeSize;
}

/** Milestone status or decision code as a coloured pill; the label is translated at render time. */
export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const { t } = useTranslation("milestones");
  return (
    <Badge tone={tones[status]} size={size}>
      {t(`status.${status}`)}
    </Badge>
  );
}
