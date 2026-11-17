import { resolve } from "node:path";

/**
 * Repository root, whatever the working directory: `pnpm dev` runs the API from apps/api, and some
 * modules read shared files (permissions.json, resources.json, the Data Pack) when they load.
 */
export const repoRoot = () =>
  process.env.REPO_ROOT ?? resolve(__dirname, "../../../..");

/**
 * Environment for the Python engine and tools. Their stdin and stdout carry JSON with Vietnamese
 * text; without UTF-8 mode, Python on Windows encodes them with the console code page (cp1252)
 * and fails on the first Vietnamese letter.
 */
export const pythonEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PYTHONUTF8: "1",
  PYTHONIOENCODING: "utf-8",
});
