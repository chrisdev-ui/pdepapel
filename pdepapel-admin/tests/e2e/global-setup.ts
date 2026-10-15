import { assertTestDatabaseEnv } from "../../scripts/lib/test-database.mjs";

export default function globalSetup() {
  assertTestDatabaseEnv(process.env, "Playwright");
}
