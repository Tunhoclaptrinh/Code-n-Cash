import { exactDecimal } from "../common/field-validation";
import { BadRequestException } from "@nestjs/common";
import type { ContractDraft, SigningPreset, Role } from "./types";
import type { Ctx } from "./context";
import { entity } from "./factory";
export const TEMPLATE_RESOURCE = "contract-templates";
const defaults = {
  contractType: "GOODS_SUPPLY",
  approvalPolicy: "SINGLE_BUYER_APPROVAL",
  valueMillion: "1000.00",
  graceDays: 5,
  penaltyRatePct: "0.10",
  maxPenaltyPct: "8.00",
  active: true,
  documentBody: "",
  description: "",
  origin: "SEED",
};
/** Seed once, never resurrect a template deleted by an administrator. */
export const initialContractTemplates = () =>
  [
    ["SINGLE_SIGNER", "Một người ký", "CONTRACT_OWNER"],
    ["BUYER_FIRST", "Bên mua ký trước", "CONTRACT_OWNER;SUPPLIER"],
    ["SUPPLIER_FIRST", "Nhà cung cấp ký trước", "SUPPLIER;CONTRACT_OWNER"],
    ["THREE_PARTY", "Ba người ký", "SUPPLIER;FINANCE_APPROVER;CONTRACT_OWNER"],
  ].map(([id, name, signerRoles]) =>
    entity(id, {
      ...defaults,
      name,
      code: id,
      signerRoles,
      organizationId: "OPS",
    }),
  );
export function templateSnapshot(ctx: Ctx, input: ContractDraft) {
  if (!input.templateId) return undefined;
  const prior = ctx.draft(input.code)?.templateSnapshot;
  if (
    prior?.id === input.templateId &&
    (!input.templateVersion || input.templateVersion === prior.version)
  )
    return prior;
  const record = ctx.t[TEMPLATE_RESOURCE]?.find(
    (row) => row.id === input.templateId && row.active === true,
  );
  if (
    record &&
    input.templateVersion &&
    record.version !== input.templateVersion
  )
    throw new BadRequestException("VERSION_CONFLICT");
  if (!record) throw new BadRequestException("CONTRACT_TEMPLATE_UNAVAILABLE");
  return {
    id: record.id,
    version: record.version,
    name: String(record.name),
    documentBody: String(record.documentBody ?? ""),
  };
}
export function templatePresets(
  ctx: Ctx,
  buyerPeople: { userId: string; role: Role }[],
): SigningPreset[] {
  return (ctx.t[TEMPLATE_RESOURCE] ?? [])
    .filter((row) => row.active === true)
    .map((row) => {
      const used = new Set<string>();
      const signers = String(row.signerRoles)
        .split(";")
        .map((role) => {
          const user =
            role === "SUPPLIER"
              ? undefined
              : buyerPeople.find(
                  (person) => person.role === role && !used.has(person.userId),
                );
          if (user) used.add(user.userId);
          return {
            party:
              role === "SUPPLIER" ? ("SUPPLIER" as const) : ("BUYER" as const),
            userId: user?.userId ?? "",
          };
        });
      return {
        id: row.id,
        name: String(row.name),
        version: row.version,
        description: String(row.description ?? ""),
        signers,
        defaults: {
          type: row.contractType,
          approvalPolicy: row.approvalPolicy,
          valueMillion: row.valueMillion,
          graceDays: row.graceDays,
          penaltyRatePct: row.penaltyRatePct,
          maxPenaltyPct: row.maxPenaltyPct,
          documentBody: row.documentBody,
        } as SigningPreset["defaults"],
      };
    });
}
/** Cross-field constraints are shared by create/update/import; defaults are never executable code. */
export function validateContractTemplate(record: Record<string, unknown>) {
  if (
    !exactDecimal(record.valueMillion, "1000000", true) ||
    !exactDecimal(record.penaltyRatePct, "5") ||
    !exactDecimal(record.maxPenaltyPct, "100")
  )
    throw new BadRequestException("CONTRACT_TEMPLATE_INVALID");
  const roles = String(record.signerRoles ?? "").split(";");
  if (
    !roles.length ||
    roles.length > 4 ||
    (roles.length > 1 &&
      (!roles.includes("SUPPLIER") ||
        roles.every((role) => role === "SUPPLIER")))
  )
    throw new BadRequestException("CONTRACT_TEMPLATE_INVALID");
  return record;
}
