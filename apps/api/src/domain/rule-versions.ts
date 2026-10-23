import { BadRequestException } from "@nestjs/common";
import { canonical, sha256 } from "../common/audit-chain";
import type { RecordEntity } from "../common/types";
import type { Tables } from "./records";

export const versionHash = (record: RecordEntity) =>
  sha256(canonical({ rules: record.rules, templates: record.templates }));
export function pinnedVersion(
  tables: Tables,
  id?: string,
): RecordEntity | undefined {
  const versions = tables["rule-versions"] ?? [];
  const version = id
    ? versions.find((entry) => entry.id === id)
    : versions.find((entry) => entry.status === "PUBLISHED");
  if (id && !version) throw new BadRequestException("RULE_VERSION_INVALID");
  if (
    version &&
    (!["PUBLISHED", "RETIRED"].includes(String(version.status)) ||
      versionHash(version) !== version.hash)
  )
    throw new BadRequestException("RULE_VERSION_INVALID");
  return version;
}
export const versionRuleSet = (base: string, id: string) =>
  `${base}~${id.replaceAll("-", "")}`;
