import { getSigningOverview as overview } from "@/shared/api/domain";

export {
  getDefaultSignatureSlots,
  getSigningConfig,
  saveSignatureSlots,
  signingKeys,
} from "@/shared/api/domain";

/** The API knows who is signed in; the user id only scopes the query key. */
export const getSigningOverview = (contractCode: string, _userId?: string) =>
  overview(contractCode);
