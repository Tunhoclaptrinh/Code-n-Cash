import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App as AntApp, Space } from "antd";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import type { MilestoneDetail } from "@codecash/contracts";
import { getMilestoneDetail, transferToAccounting } from "@/shared/api/domain";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { PageState } from "@/shared/ui/PageState";
import { ContractSideLayout } from "@/shared/ui/ContractSideLayout";
import { SideCard } from "@/shared/ui/SidePanel";
import { AmountsPanel } from "../components/AmountsPanel";
import { ConditionsPanel } from "../components/ConditionsPanel";
import {
  DecisionBanner,
  DecisionTechnical,
} from "../components/DecisionBanner";
import { DecisionTrace } from "../components/DecisionTrace";
import { RulesPanel } from "../components/RulesPanel";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";

/** Milestone decision with its full trace: rule, facts, events, amounts and status history (spec 14.5). */
export default function MilestoneDecisionPage() {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const params = useParams();
  const contractId = params.contractId ?? "";
  const sequence = Number(params.milestoneNo);
  const view = useQuery({
    queryKey: ["milestones", "decision", contractId, sequence],
    queryFn: () => getMilestoneDetail(contractId, sequence),
  });
  const data = view.data;
  return (
    <AppPage
      guide="decision"
      active="contracts"
      breadcrumb={[
        { label: contractId, to: `/contracts/${contractId}` },
        {
          label: data
            ? t("decision.breadcrumb", {
                no: sequence,
                name: td(`milestoneType.${data.milestone.type}`),
              })
            : String(sequence),
        },
      ]}
    >
      {view.isPending ? <PageState kind="loading" /> : null}
      {view.isError ? (
        <PageState kind="error" onRetry={() => void view.refetch()} />
      ) : null}
      {data ? <DecisionContent data={data} /> : null}
    </AppPage>
  );
}

function DecisionContent({ data }: { data: MilestoneDetail }) {
  const { t } = useTranslation("milestones");
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const { contract, milestone, evaluation, money } = data;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["milestones"] });
  const failed = useApiErrorMessage();
  const transfer = useMutation({
    mutationFn: () =>
      transferToAccounting({
        contractId: contract.id,
        sequence: milestone.sequence,
      }),
    onSuccess: async () => {
      message.success(t("decision.transferred"));
      await refresh();
    },
    onError: failed,
  });

  return (
    <ContractSideLayout contractId={contract.id}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {data.payment ? (
          <Alert
            type="success"
            showIcon
            title={t("decision.payment.title", {
              amount: formatDecimalString(data.payment.amountMillion),
              by: data.payment.transferredBy,
              at: formatDateTime(data.payment.transferredAt),
            })}
          />
        ) : null}
        {evaluation.issues.length || evaluation.notes.length ? (
          <Alert
            type="warning"
            showIcon
            title={t("decision.issues")}
            description={[...evaluation.issues, ...evaluation.notes].join(
              " · ",
            )}
          />
        ) : null}

        <SideCard>
          <DecisionBanner
            data={data}
            transferring={transfer.isPending}
            onTransfer={() => transfer.mutate()}
          />
          <ConditionsPanel data={data} />
          <AmountsPanel money={money} />
          <RulesPanel data={data} />
          <DecisionTechnical data={data} />
        </SideCard>
        <DecisionTrace data={data} onChanged={refresh} />
      </Space>
    </ContractSideLayout>
  );
}
