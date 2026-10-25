import { useParams } from "react-router-dom";
import { Space } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { WorkflowContext } from "@/shared/ui/WorkflowContext";
import { getDispute } from "@/shared/api/domain";
import { AppPage } from "@/shared/layout/AppPage";
import { MilestoneStatusTag, OriginTag } from "@/shared/ui/DomainTags";
import { PageState } from "@/shared/ui/PageState";
import { DecisionPanel } from "../components/DecisionPanel";
import { SubmissionPanel } from "../components/SubmissionPanel";
import styles from "./DisputePage.module.css";

export default function DisputePage() {
  const { t } = useTranslation("disputes");
  const { t: td } = useTranslation("domain");
  const params = useParams();
  const contractId = params.contractId ?? "";
  const sequence = Number(params.milestoneNo);
  const dispute = useQuery({
    queryKey: ["dispute", contractId, sequence],
    queryFn: () => getDispute(contractId, sequence),
  });
  const data = dispute.data;
  return (
    <AppPage
      guide="dispute"
      active="contracts"
      tags={
        data ? (
          <Space size={6} wrap>
            <MilestoneStatusTag status={data.milestone.status} />
            <OriginTag origin={data.contract.origin} />
          </Space>
        ) : undefined
      }
      breadcrumb={[
        { label: contractId, to: `/contracts/${contractId}` },
        { label: t("breadcrumb.dispute", { milestoneNo: sequence }) },
      ]}
    >
      {dispute.isPending ? <PageState kind="loading" /> : null}
      {dispute.isError ? (
        <PageState kind="error" onRetry={() => void dispute.refetch()} />
      ) : null}
      {data ? (
        <>
          <WorkflowContext>
            {td(`milestoneType.${data.milestone.type}`)} · {data.contract.title}{" "}
            · {data.contract.buyer.name} ↔ {data.contract.supplier.name}
          </WorkflowContext>
          <div className={styles.columns}>
            <SubmissionPanel view={data} />
            <DecisionPanel
              key={`${data.evaluation.runId}-${data.disputes.length}`}
              view={data}
            />
          </div>
        </>
      ) : null}
    </AppPage>
  );
}
