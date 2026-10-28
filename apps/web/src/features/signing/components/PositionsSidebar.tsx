import { useState } from "react";
import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { SlotEditor } from "../hooks/useSlotEditor";
import type { SlotFlag } from "../lib/signature-layout";
import type { SigningConfig } from "../types";
import { LayoutProblems } from "./LayoutProblems";
import { SignedPreviewModal } from "./SignedPreviewModal";
import styles from "./SignaturePositions.module.css";
import { SlotListCard } from "./SlotListCard";
import shared from "./shared.module.css";

interface PositionsSidebarProps {
  contractId: string;
  config: SigningConfig;
  editor: SlotEditor;
  flags: Record<number, SlotFlag>;
  problems: string[];
  canContinue: boolean;
}

/**
 * Right column: step cards, unmet rules and the continue/back footer. Continuing first shows the
 * document as it will look once signed; the positions are saved only when the user confirms there.
 */
export function PositionsSidebar({
  contractId,
  config,
  editor,
  flags,
  problems,
  canContinue,
}: PositionsSidebarProps) {
  const { t } = useTranslation("signing");
  const { save, boxes } = editor;
  const [previewing, setPreviewing] = useState(false);
  return (
    <div className={styles.side}>
      <SlotListCard config={config} editor={editor} flags={flags} />

      <LayoutProblems problems={problems} />

      <div className={styles.footer} data-testid="positions-footer">
        <Link
          to={`/contracts/new?draft=${encodeURIComponent(contractId)}`}
          className={shared.btnSecondary}
        >
          {t("positions.actions.back")}
        </Link>
        {canContinue ? (
          <Button
            type="primary"
            size="small"
            disabled={save.isPending}
            onClick={() => setPreviewing(true)}
            data-testid="positions-save"
          >
            {t("positions.actions.continue")}
          </Button>
        ) : (
          <Button type="primary" size="small" disabled>
            {t("positions.actions.continue")}
          </Button>
        )}
      </div>
      <SignedPreviewModal
        contractId={contractId}
        config={config}
        boxes={boxes}
        open={previewing}
        saving={save.isPending}
        // On success the editor moves on; a refused save closes the preview so its error shows.
        onConfirm={() =>
          save.mutate(undefined, { onError: () => setPreviewing(false) })
        }
        onCancel={() => setPreviewing(false)}
      />
    </div>
  );
}
