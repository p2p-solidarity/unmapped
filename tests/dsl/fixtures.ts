// Hand-written DSL programs used only by the tests (Rule 2: fixtures never reach app code).

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, "..", "fixtures", "dsl", name), "utf8");
