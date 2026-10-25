import type { ReactNode } from "react";
import { Collapse, Descriptions, Typography } from "antd";
import { useTranslation } from "react-i18next";

/**
 * A code the organiser grades or a reviewer traces (contract, milestone, event, rule, reason).
 * Kept visible but quiet next to the business wording.
 */
export function TrackingCode({ code }: { code: string | null | undefined }) {
  if (!code) return null;
  return (
    <Typography.Text
      type="secondary"
      copyable={{ text: code }}
      style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}
      data-testid="tracking-code"
    >
      {code}
    </Typography.Text>
  );
}

type TechnicalItem = { key: string; label: ReactNode; value: ReactNode };
const present = (items: TechnicalItem[]) =>
  items.filter(
    (item) =>
      item.value !== null && item.value !== undefined && item.value !== "",
  );

/** The technical fields themselves, e.g. inside an expanded table row. */
export function TechnicalList({ items }: { items: TechnicalItem[] }) {
  return (
    <Descriptions
      column={1}
      size="small"
      // A bounded width keeps an expanded table row from stretching a max-content table.
      style={{ maxWidth: 560 }}
      data-testid="technical-list"
      items={present(items).map((item) => ({
        key: item.key,
        label: item.label,
        children: item.value,
      }))}
    />
  );
}

/** System detail (sources, document references, run IDs): collapsed so business screens stay readable. */
export function TechnicalDetails({ items }: { items: TechnicalItem[] }) {
  const { t } = useTranslation("common");
  const shown = present(items);
  if (!shown.length) return null;
  return (
    <Collapse
      ghost
      size="small"
      data-testid="technical-details"
      items={[
        {
          key: "technical",
          label: (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("technical.title")}
            </Typography.Text>
          ),
          children: <TechnicalList items={shown} />,
        },
      ]}
    />
  );
}
