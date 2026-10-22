import { workflowCall } from "@/shared/api/workflow";
import type { ContractList, ContractViewer } from "../types";
/**
 * Contracts the viewer may see: the buying organisation sees everything,
 * a supplier only sees the contracts it is the supplier of.
 */
export async function getContractList(
  viewer: ContractViewer,
): Promise<ContractList> {
  return workflowCall("contracts-contractList", "getContractList", [viewer]);
}
