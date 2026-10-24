import { Tag, Tooltip } from "antd";
import type {
  ContractStatus,
  Decision,
  MilestoneStatus,
  Origin,
} from "@codecash/contracts";
import { useTranslation } from "react-i18next";
import { contractStatusTone, decisionTone, statusTone } from "../lib/domain";
import { ToneTag } from "./ToneTag";

const originColor: Record<Origin, string> = {
  DATA_PACK: "blue",
  SEED: "gold",
  APP: "green",
};

/**
 * Where a record comes from: the organiser's Data Pack, demo seed data added because the Data Pack
 * does not have it, or an action taken in the app. Shown wherever records are listed.
 */
export function OriginTag({ origin }: { origin: Origin }) {
  const { t } = useTranslation("domain");
  return (
    <Tooltip title={t(`origin.hint.${origin}`)}>
      <Tag
        color={originColor[origin]}
        variant="filled"
        style={{ margin: 0, fontSize: 11.5, lineHeight: "18px" }}
        data-testid={`origin-${origin}`}
      >
        {t(`origin.${origin}`)}
      </Tag>
    </Tooltip>
  );
}

export function MilestoneStatusTag({ status }: { status: MilestoneStatus }) {
  const { t } = useTranslation("domain");
  return <ToneTag tone={statusTone[status]}>{t(`status.${status}`)}</ToneTag>;
}

export function ContractStatusTag({ status }: { status: ContractStatus }) {
  const { t } = useTranslation("domain");
  return (
    <ToneTag tone={contractStatusTone[status]}>
      {t(`contractStatus.${status}`)}
    </ToneTag>
  );
}

export function DecisionTag({ decision }: { decision: Decision }) {
  const { t } = useTranslation("domain");
  return (
    <Tooltip title={t(`decisionHint.${decision}`)}>
      <span>
        <ToneTag tone={decisionTone[decision]}>{decision}</ToneTag>
      </span>
    </Tooltip>
  );
}
