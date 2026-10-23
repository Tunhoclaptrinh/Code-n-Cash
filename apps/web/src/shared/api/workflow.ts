import { platform } from "./platform";
import { ApiError as HttpError } from "@codecash/api-client";
import { ApiError } from "./client";
/** Preserve domain error codes expected by the existing feature screens. */
export async function workflowCall<T>(
  module: string,
  action: string,
  args: unknown[],
): Promise<T> {
  try {
    const result = await platform.post<T>(`/workflow/${module}/${action}`, {
      args,
    });
    if (!/^(get|list)/.test(action))
      window.dispatchEvent(new Event("codecash:workflow-changed"));
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw new ApiError(error.code);
    throw error;
  }
}
