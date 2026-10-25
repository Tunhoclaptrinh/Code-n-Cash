import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { SlotEditor } from "../hooks/useSlotEditor";
import type { SlotFlag } from "../lib/signature-layout";
import type { SigningConfig } from "../types";
import { LayoutProblems } from "./LayoutProblems";
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

/** Right column: step cards, unmet rules and the continue/back footer. */
export function PositionsSidebar({
  contractId,
  config,
  editor,
  flags,
  problems,
  canContinue,
}: PositionsSidebarProps) {
  const { t } = useTranslation("signing");
  const { save } = editor;
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
            onClick={() => save.mutate()}
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
    </div>
  );
}
