import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getDispute } from "@/shared/api/domain";
import { AppPage } from "@/shared/layout/AppPage";
import { contractHeading } from "@/shared/lib/domain";
import { MilestoneStatusTag } from "@/shared/ui/DomainTags";
import { ContractSideLayout } from "@/shared/ui/ContractSideLayout";
import { PageState } from "@/shared/ui/PageState";
import { SideCard } from "@/shared/ui/SidePanel";
import { DecisionPanel } from "../components/DecisionPanel";
import { SubmissionPanel } from "../components/SubmissionPanel";

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
        data ? <MilestoneStatusTag status={data.milestone.status} /> : undefined
      }
      breadcrumb={[
        { label: contractId, to: `/contracts/${contractId}` },
        {
          label: data
            ? t("title", {
                milestoneNo: sequence,
                milestone: td(`milestoneType.${data.milestone.type}`),
              })
            : t("breadcrumb.dispute", { milestoneNo: sequence }),
        },
      ]}
    >
      {dispute.isPending ? <PageState kind="loading" /> : null}
      {dispute.isError ? (
        <PageState kind="error" onRetry={() => void dispute.refetch()} />
      ) : null}
      {data ? (
        <ContractSideLayout
          contractId={data.contract.id}
          context={
            <>
              {contractHeading(data.contract)} · {data.contract.supplier.name}
            </>
          }
        >
          <SideCard>
            <SubmissionPanel view={data} />
            <DecisionPanel
              key={`${data.evaluation.runId}-${data.disputes.length}`}
              view={data}
            />
          </SideCard>
        </ContractSideLayout>
      ) : null}
    </AppPage>
  );
}
