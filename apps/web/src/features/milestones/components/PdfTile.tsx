import { useTranslation } from "react-i18next";
import styles from "./PdfTile.module.css";

interface PdfTileProps {
  variant: "signed" | "unsigned" | "plain" | "chip";
}

/** Small "PDF" marker shown next to document names. */
export function PdfTile({ variant }: PdfTileProps) {
  const { t } = useTranslation("milestones");
  return (
    <span className={[styles.tile, styles[variant]].join(" ")}>
      {t("common.pdf")}
    </span>
  );
}
