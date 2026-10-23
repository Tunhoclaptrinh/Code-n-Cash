import { resolve } from "node:path";

/**
 * Repository root, whatever the working directory: `pnpm dev` runs the API from apps/api, and some
 * modules read shared files (permissions.json, resources.json, the Data Pack) when they load.
 */
export const repoRoot = () =>
  process.env.REPO_ROOT ?? resolve(__dirname, "../../../..");
