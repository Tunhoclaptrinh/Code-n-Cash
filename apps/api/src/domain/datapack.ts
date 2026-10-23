import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readRecords } from "./csv";
import { COLUMNS } from "./records";
import { repoRoot } from "../common/paths";

export const dataPackDir = () =>
  resolve(repoRoot(), "BangD-Case4/DataPack-CASE4_SmartContractWorkflow");

const FILES = {
  contracts: "01_data/contracts.csv",
  parties: "01_data/parties.csv",
  milestones: "01_data/milestones.csv",
  events: "01_data/events.csv",
  payment_rules: "01_data/payment_rules.csv",
} as const;

export type DataPack = Record<keyof typeof FILES, Record<string, string>[]>;

/** Reads the five data tables and checks each still has the organiser's columns. */
export async function loadDataPack(dir = dataPackDir()): Promise<DataPack> {
  const pack = {} as DataPack;
  for (const [name, file] of Object.entries(FILES) as [
    keyof typeof FILES,
    string,
  ][]) {
    const { columns, rows } = readRecords(
      await readFile(resolve(dir, file), "utf8"),
    );
    const missing = COLUMNS[name].filter((key) => !columns.includes(key));
    if (missing.length)
      throw new Error(
        `DATA_PACK_COLUMNS_MISSING ${file}: ${missing.join(",")}`,
      );
    pack[name] = rows;
  }
  return pack;
}
