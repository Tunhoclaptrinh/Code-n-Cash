import { useQuery } from "@tanstack/react-query";
import { Alert, Descriptions, Space } from "antd";
import { useTranslation } from "react-i18next";
import { getSmartContract } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { TrackingCode } from "@/shared/ui/TechnicalInfo";

/**
 * What the signer's signature will be bound to, shown right before signing: the document (or the terms
 * snapshot) by its digest, and the rule set the contract will be executed with. The API binds exactly
 * these digests to the signature.
 */
export function SigningSubject({ contractId }: { contractId: string }) {
  const { t } = useTranslation("signing");
  const { t: td } = useTranslation("domain");
  const user = useCurrentUser();
  const view = useQuery({
    queryKey: ["contract-view", user.id, contractId, "smart"],
    queryFn: () => getSmartContract(contractId),
  });
  const binding = view.data?.binding;
  if (!binding?.basis) return null;
  const ruleSet = td(`ruleSet.${binding.ruleSetId}`, {
    defaultValue: binding.ruleSetId,
  });
  return (
    <Alert
      type={binding.intact ? "info" : "error"}
      showIcon
      data-testid="signing-subject"
      title={t(binding.intact ? "subject.title" : "subject.changed")}
      description={
        <Descriptions
          size="small"
          column={1}
          items={[
            {
              key: "document",
              label: t(`subject.basis.${binding.basis}`),
              children: <TrackingCode code={binding.signedDigest} />,
            },
            {
              key: "rules",
              label: t("subject.rules"),
              children: binding.ruleVersion ? (
                <Space orientation="vertical" size={0}>
                  <span>{t("subject.ruleVersion", { ruleSet })}</span>
                  <TrackingCode code={binding.ruleVersion.hash} />
                </Space>
              ) : (
                t("subject.ruleSet", { ruleSet })
              ),
            },
          ]}
        />
      }
    />
  );
}
