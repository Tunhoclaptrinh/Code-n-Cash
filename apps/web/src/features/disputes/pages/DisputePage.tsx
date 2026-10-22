import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@codecash/ui";
import { AppPage } from "@/shared/layout/AppPage";
import { PageState } from "@/shared/ui/PageState";
import { ToneTag, type Tone } from "@/shared/ui/ToneTag";
import { getDispute } from "../api/dispute.api";
import { DecisionPanel } from "../components/DecisionPanel";
import { SubmissionPanel } from "../components/SubmissionPanel";
import type { DisputeStatus } from "../types";
import styles from "./DisputePage.module.css";

const STATUS_TONE: Record<DisputeStatus, Tone> = {
  OPEN: "warning",
  AWAITING_EVIDENCE: "warning",
  RESOLVED: "success",
};

/** Milestone currently on HOLD while the dispute is unresolved. */
const HELD_DECISION = "HOLD";

export default function DisputePage() {
  const { t } = useTranslation("disputes");
  const params = useParams();
  const contractCode = params.contractId ?? "";
  const milestoneNo = Number(params.milestoneNo);

  const dispute = useQuery({
    queryKey: ["dispute", contractCode, milestoneNo],
    queryFn: () => getDispute(contractCode, milestoneNo),
  });

  const data = dispute.data;

  return (
    <AppPage
      active="contracts"
      breadcrumb={[
        { label: contractCode, to: `/contracts/${contractCode}` },
        { label: t("breadcrumb.dispute", { milestoneNo }) },
      ]}
    >
      {dispute.isPending ? <PageState kind="loading" /> : null}
      {dispute.isError ? <PageState kind="notFound" /> : null}
      {data ? (
        <>
          <PageHeader
            title={t("title", {
              milestoneNo,
              milestone: t(`milestones.${data.milestoneKind}`),
            })}
            tags={
              <ToneTag tone={STATUS_TONE[data.status]}>
                {t(`status.${data.status}`, { decision: HELD_DECISION })}
              </ToneTag>
            }
          />
          <div className={styles.columns}>
            <SubmissionPanel dispute={data} />
            <DecisionPanel dispute={data} />
          </div>
        </>
      ) : null}
    </AppPage>
  );
}
