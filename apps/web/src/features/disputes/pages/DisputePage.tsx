import { useParams } from "react-router-dom";
import { Space } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@codecash/ui";
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
          <PageHeader
            title={t("title", {
              milestoneNo: sequence,
              milestone: td(`milestoneType.${data.milestone.type}`),
            })}
            subtitle={`${data.contract.id} · ${data.contract.title} · ${data.contract.buyer.name} ↔ ${data.contract.supplier.name}`}
            tags={
              <Space size={6}>
                <MilestoneStatusTag status={data.milestone.status} />
                <OriginTag origin={data.contract.origin} />
              </Space>
            }
          />
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
