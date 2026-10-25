import { useTranslation } from "react-i18next";
import { Alert, Space } from "antd";
import { BaseCard } from "@codecash/ui";
import type { ContractFile } from "../types";

/** Lists only what is still missing before the signing positions can be placed. */
export function FileChecksPanel({
  file,
  signingSteps,
}: {
  file: ContractFile;
  signingSteps: number;
}) {
  const { t } = useTranslation("contracts", { keyPrefix: "lite" });
  // Nothing chosen yet: the form's own required markers already say what to do.
  if (!file.name && signingSteps === 0) return null;
  const missing = [
    ...(file.name ? [] : [t("checks.noFile")]),
    ...(signingSteps > 0 ? [] : [t("checks.noSigners")]),
  ];
  if (!missing.length) return null;
  return (
    <BaseCard title={t("checks.title")}>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {missing.map((text) => (
          <Alert key={text} type="warning" showIcon title={text} />
        ))}
      </Space>
    </BaseCard>
  );
}
