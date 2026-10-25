import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { SlotEditor } from "../hooks/useSlotEditor";
import { cx } from "../lib/helpers";
import type { LayoutCheck, SlotFlag } from "../lib/signature-layout";
import type { SigningConfig } from "../types";
import { LayoutChecksCard } from "./LayoutChecksCard";
import styles from "./SignaturePositions.module.css";
import { SlotListCard } from "./SlotListCard";
import shared from "./shared.module.css";

interface PositionsSidebarProps {
  contractId: string;
  config: SigningConfig;
  editor: SlotEditor;
  flags: Record<number, SlotFlag>;
  checks: LayoutCheck[];
  canContinue: boolean;
}

/** Right column: step cards, tip, rule checks and the continue/back footer. */
export function PositionsSidebar({
  contractId,
  config,
  editor,
  flags,
  checks,
  canContinue,
}: PositionsSidebarProps) {
  const { t } = useTranslation("signing");
  const { save } = editor;
  return (
    <div className={styles.side}>
      <SlotListCard config={config} editor={editor} flags={flags} />

      <div className={cx(shared.notice, styles.tip)}>
        <b className={shared.noticeTitle}>{t("positions.tip.label")}</b>{" "}
        {t("positions.tip.body")}
      </div>

      <LayoutChecksCard checks={checks} />

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
          <span className={styles.blocked} role="status">
            {t("positions.actions.blocked")}
          </span>
        )}
      </div>
    </div>
  );
}
