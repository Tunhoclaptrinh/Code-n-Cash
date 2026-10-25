import { useQuery } from "@tanstack/react-query";
import { listDemoAccounts } from "../api/auth.api";

/** True when the API offers one-click demo sign-in; demo-only hints (account emails) depend on it. */
export function useDemoMode() {
  const demo = useQuery({
    queryKey: ["demo-accounts"],
    queryFn: listDemoAccounts,
    staleTime: Infinity,
  });
  return demo.data?.enabled === true;
}
