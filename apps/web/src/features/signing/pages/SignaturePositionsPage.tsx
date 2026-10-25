import { type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { AppPage } from "@/shared/layout/AppPage";
import { getSigningConfig, signingKeys } from "../api/signingConfig.api";
import { PageState } from "@/shared/ui/PageState";
import { WizardStepper } from "../components/WizardStepper";
import { PositionsAlerts } from "../components/PositionsAlerts";
import { PositionsCanvasCard } from "../components/PositionsCanvasCard";
import { PositionsSidebar } from "../components/PositionsSidebar";
import { useCanvasView } from "../hooks/useCanvasView";
import { useSlotEditor } from "../hooks/useSlotEditor";
import { cx } from "../lib/helpers";
import { analyzeLayout, pageHeightOf } from "../lib/signature-layout";
import type { SigningConfig } from "../types";
import "../signingTokens.css";
import styles from "../components/SignaturePositions.module.css";

export default function SignaturePositionsPage() {
  const { t } = useTranslation("signing");
  const contractId = useParams().contractId ?? "";
  const config = useQuery({
    queryKey: signingKeys.config(contractId),
    queryFn: () => getSigningConfig(contractId),
  });

  return (
    <AppPage
      guide="signing"
      active="upload"
      breadcrumb={[
        {
          label: t("positions.breadcrumb.parent"),
          to: `/contracts/new?draft=${encodeURIComponent(contractId)}`,
        },
        { label: t("positions.breadcrumb.current") },
      ]}
    >
      {config.data ? (
        <Editor
          key={`${config.data.documentId ?? "seed"}:${config.data.layoutVersion ?? 0}`}
          contractId={contractId}
          config={config.data}
        />
      ) : (
        <PageState kind={config.isError ? "error" : "loading"} />
      )}
    </AppPage>
  );
}

interface EditorProps {
  contractId: string;
  config: SigningConfig;
}

function Editor({ contractId, config }: EditorProps) {
  const navigate = useNavigate();
  const editor = useSlotEditor(contractId, config);
  const { boxes, looks, page, imageReady, save, reset } = editor;
  const {
    flags,
    hasNamedAreas,
    incompatible,
    unconfiguredPrinted,
    problems,
    canContinue,
  } = analyzeLayout(config, boxes, looks, imageReady);
  const view = useCanvasView({
    activeStep: editor.activeStep,
    page,
    currentPageHeight: pageHeightOf(config.previewPages, page),
    imageReady,
    focusRevision: editor.focusRevision,
    drag: editor.drag,
    incompatibleCount: incompatible.length,
    unconfiguredCount: unconfiguredPrinted.length,
  });
  const pageData = config.previewPages.find(
    (candidate) => candidate.pageNo === page,
  );

  return (
    <>
      <WizardStepper current="SIGN_POSITIONS" />
      <PositionsAlerts
        config={config}
        error={save.error ?? reset.error}
        scanNotice={pageData?.contentCheck === "MANUAL"}
        hasNamedAreas={hasNamedAreas}
        incompatible={incompatible}
        unconfiguredPrinted={unconfiguredPrinted}
        onCorrectSigners={() =>
          navigate(`/contracts/new?draft=${encodeURIComponent(contractId)}`)
        }
      />
      <div
        className={cx(styles.layout, view.expanded && styles.layoutExpanded)}
        ref={view.layoutRef}
        style={
          { "--editor-side-height": `${view.sideHeight}px` } as CSSProperties
        }
      >
        <PositionsCanvasCard
          contractId={contractId}
          config={config}
          editor={editor}
          view={view}
          flags={flags}
        />
        <PositionsSidebar
          contractId={contractId}
          config={config}
          editor={editor}
          flags={flags}
          problems={problems}
          canContinue={canContinue}
        />
      </div>
    </>
  );
}
