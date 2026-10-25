import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App as AntApp, Col, Row, Space } from "antd";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import type { MilestoneDetail } from "@codecash/contracts";
import { getMilestoneDetail, transferToAccounting } from "@/shared/api/domain";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { PageState } from "@/shared/ui/PageState";
import { Panel } from "@/shared/ui/Panel";
import { AmountsPanel } from "../components/AmountsPanel";
import { ConditionsPanel } from "../components/ConditionsPanel";
import { DecisionBanner } from "../components/DecisionBanner";
import { DecisionEventTable } from "../components/DecisionEventTable";
import { ExceptionPanel } from "../components/ExceptionPanel";
import { HistoryPanel } from "../components/HistoryPanel";
import { ReplayPanel } from "../components/ReplayPanel";
import { RulesPanel } from "../components/RulesPanel";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import styles from "../components/MilestoneDecision.module.css";

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
  const base = `/contracts/${contract.id}/milestones/${milestone.sequence}`;
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
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <DecisionBanner
        data={data}
        transferring={transfer.isPending}
        onTransfer={() => transfer.mutate()}
      />

      {data.payment ? (
        <Alert
          type="success"
          showIcon
          title={t("decision.payment.title", {
            amount: formatDecimalString(data.payment.amountMillion),
            by: data.payment.transferredBy,
            at: formatDateTime(data.payment.transferredAt),
          })}
          description={t("decision.payment.body", { id: data.payment.id })}
        />
      ) : null}
      {evaluation.issues.length || evaluation.notes.length ? (
        <Alert
          type="warning"
          showIcon
          title={t("decision.issues")}
          description={[...evaluation.issues, ...evaluation.notes].join(" · ")}
        />
      ) : null}

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={12}>
          <ConditionsPanel data={data} />
        </Col>
        <Col xs={24} lg={12}>
          <AmountsPanel money={money} />
        </Col>
        <Col xs={24}>
          <RulesPanel data={data} />
        </Col>
        <Col xs={24}>
          <Panel className={styles.panel}>
            <h2>{t("decision.events.title", { count: data.events.length })}</h2>
            <DecisionEventTable
              events={data.events}
              evidence={evaluation.evidence}
            />
          </Panel>
        </Col>
        <Col xs={24}>
          <ReplayPanel contractId={contract.id} sequence={milestone.sequence} />
        </Col>
        <Col xs={24} lg={12}>
          <HistoryPanel history={data.history} />
        </Col>
        <Col xs={24} lg={12}>
          <ExceptionPanel data={data} onChanged={refresh} />
        </Col>
      </Row>

      <Panel as="div" className={styles.dispute}>
        <b className={styles.disputeTitle}>{t("decision.dispute.title")}</b>
        <span className={styles.disputeText}>{t("decision.dispute.body")}</span>
        <Link to={`${base}/dispute`} className={styles.disputeLink}>
          {t("decision.dispute.link")}
        </Link>
      </Panel>
    </Space>
  );
}
