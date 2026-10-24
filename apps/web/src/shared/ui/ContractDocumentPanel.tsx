import { Collapse } from "antd";
import { useTranslation } from "react-i18next";
import { ContractDocuments } from "./ContractDocuments";
/** Keep the original file accessible at each review/consent step without eager conversion. */
export function ContractDocumentPanel({ contractId }: { contractId: string }) {
  const { t } = useTranslation("milestones");
  return (
    <Collapse
      style={{ marginBottom: 16 }}
      items={[
        {
          key: "documents",
          label: t("detail.tabs.documents"),
          children: <ContractDocuments contractId={contractId} />,
        },
      ]}
    />
  );
}
