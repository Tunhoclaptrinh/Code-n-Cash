import type { Entity } from "@codecash/contracts";
import type { TFunction } from "i18next";

/** Input proposals only: references come from the allowed directory, never fabricated IDs. */
export function resourceDemoInput(
  resource: string,
  organizations: Entity[],
  t: TFunction<"platform">,
  current: Record<string, unknown> = {},
): Record<string, unknown> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const selectedId =
    typeof current.organizationId === "object" &&
    current.organizationId &&
    "value" in current.organizationId
      ? current.organizationId.value
      : current.organizationId;
  const buyer =
    organizations.find((org) => org.id === selectedId) ??
    organizations.find((org) => org.kind === "BUYER");
  const supplier = organizations.find((org) => org.kind === "SUPPLIER");
  const reference = (org?: Entity) =>
    org ? { value: org.id, label: String(org.name) } : undefined;
  const common = {
    code: `DEMO_${suffix}`,
    name: t(`demo.${resource}`),
    email: `demo.${suffix}@example.test`,
  };
  switch (resource) {
    case "organizations":
      return { ...common, kind: "BUYER" };
    case "users":
      return {
        displayName: t("demo.users"),
        email: common.email,
        title: t("demo.userTitle"),
        role:
          buyer?.kind === "SUPPLIER"
            ? "SUPPLIER"
            : buyer?.kind === "INTERNAL"
              ? "AUDITOR"
              : "CONTRACT_OWNER",
        organizationId: reference(buyer),
        partyId: buyer?.kind === "INTERNAL" ? undefined : buyer?.id,
        active: true,
      };
    case "contract-drafts":
      return {
        code: common.code,
        title: t("demo.contract-drafts"),
        supplierId: reference(supplier),
        contractType: "GOODS_SUPPLY",
      };
    case "milestone-templates":
      return {
        name: common.name,
        workflowTemplate: "WF_GOODS_4STAGE",
        sequence: 1,
        milestoneType: "CONTRACT_SIGNING",
        requiredEvents: "CONTRACT_SIGNED",
        paymentPercent: "20.00",
        latePenalty: false,
        offsetDays: 7,
      };
    case "settings":
      return {
        name: `${common.name} ${suffix}`,
        value: t("demo.settingValue"),
      };
    case "contract-templates":
      return {
        code: common.code,
        name: common.name,
        description: t("demo.description"),
        contractType: "GOODS_SUPPLY",
        approvalPolicy: "SINGLE_BUYER_APPROVAL",
        valueMillion: "1000.00",
        graceDays: 5,
        penaltyRatePct: "0.10",
        maxPenaltyPct: "8.00",
        signerRoles: "CONTRACT_OWNER;SUPPLIER",
        documentBody: t("demo.documentBody"),
        active: true,
      };
    default:
      return {};
  }
}
