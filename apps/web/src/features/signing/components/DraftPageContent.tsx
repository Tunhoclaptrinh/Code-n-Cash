import { useTranslation } from "react-i18next";
import { LINE_WIDTHS } from "../lib/signature-layout";
import type { SigningConfig } from "../types";
import { SignatureBlock } from "./SignatureBlock";
import styles from "./SignaturePositions.module.css";

/**
 * A draft without an uploaded file, drawn in page units: the article heading, placeholder text lines
 * and, on the signing page, the printed signature blocks. Rendered inside a 520-unit-wide page.
 */
export function DraftPageContent({
  config,
  page,
}: {
  config: SigningConfig;
  page: number;
}) {
  const { t } = useTranslation("signing");
  const pageData = config.previewPages.find(
    (candidate) => candidate.pageNo === page,
  );
  if (!pageData) return null;
  return (
    <>
      <div className={styles.pageHeading}>
        {t(`document.article.${pageData.heading}`)}
      </div>
      {Array.from({ length: pageData.textLineCount }, (_, index) => (
        <div
          key={index}
          className={styles.textLine}
          style={{
            top: 64 + index * 18,
            width: (448 * LINE_WIDTHS[index % LINE_WIDTHS.length]) / 100,
          }}
        />
      ))}
      {pageData.hasSignatureBlock
        ? config.steps.map((step) => {
            const block = pageData.blocks.find(
              (candidate) => candidate.stepNo === step.stepNo,
            );
            return block ? (
              <SignatureBlock
                key={step.stepNo}
                step={step}
                left={block.x}
                headingTop={block.headingY + 2}
                nameTop={block.nameY + 2}
              />
            ) : null;
          })
        : null}
    </>
  );
}
