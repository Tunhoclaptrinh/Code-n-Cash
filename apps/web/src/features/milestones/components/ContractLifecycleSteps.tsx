import { Steps, Typography } from "antd";
import type { StepsProps } from "antd";
import { useTranslation } from "react-i18next";
import type {
  ContractLifecycle,
  LifecycleStage,
  LifecycleStageState,
} from "@codecash/contracts";
import { formatDate, formatDecimalString } from "@/shared/lib/format";

const stepStatus: Record<
  LifecycleStageState,
  NonNullable<StepsProps["status"]>
> = {
  DONE: "finish",
  CURRENT: "process",
  PENDING: "wait",
};

/**
 * Where the contract stands as a state machine: drafted, signed, each payment milestone settled, closed.
 * The stages and their dates come from the API; this only lays them out.
 */
export function ContractLifecycleSteps({
  lifecycle,
}: {
  lifecycle: ContractLifecycle;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const title = (stage: LifecycleStage) =>
    stage.kind === "MILESTONE"
      ? td("milestoneNo", { no: stage.sequence })
      : t(`detail.lifecycle.${stage.kind}`);
  const detail = (stage: LifecycleStage) => {
    const at = stage.at ? formatDate(stage.at) : null;
    switch (stage.kind) {
      case "DRAFTED":
        return at ?? t("detail.lifecycle.imported");
      case "SIGNED":
        return stage.state === "DONE"
          ? (at ?? "")
          : stage.total
            ? t("detail.lifecycle.signedCount", {
                signed: stage.signed,
                total: stage.total,
              })
            : "";
      case "MILESTONE":
        return [
          td(`milestoneType.${stage.type}`),
          stage.paid
            ? t("detail.lifecycle.paid", {
                value: formatDecimalString(stage.payableMillion),
              })
            : td(`status.${stage.status}`),
          stage.state === "PENDING" ? null : at,
        ]
          .filter(Boolean)
          .map((line) => <div key={line}>{line}</div>);
      case "CLOSED":
        return at ?? "";
    }
  };
  return (
    <div data-testid="contract-lifecycle">
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t("detail.lifecycle.title")}
      </Typography.Title>
      <Steps
        size="small"
        titlePlacement="vertical"
        items={lifecycle.stages.map((stage) => ({
          key:
            stage.kind === "MILESTONE"
              ? stage.milestoneId
              : (stage.kind as string),
          title: title(stage),
          content: detail(stage),
          status:
            stage.kind === "MILESTONE" &&
            stage.status === "REJECTED" &&
            !stage.paid
              ? "error"
              : stepStatus[stage.state],
        }))}
      />
    </div>
  );
}
