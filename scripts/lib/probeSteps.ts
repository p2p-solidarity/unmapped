// What scripts/world-probe.ts prints (rev 6 phase 3, Rule 0): one JSON line per step — the
// scenario, the step, the expected answer (a refusal code, or "accepted" / "opened:<role>" for a
// control step), the answer the service gave, and whether they match — then one summary line per
// scenario. The E2E `result.md` files cite these lines verbatim, so the format is fixed.

export interface StepLine {
  scenario: string;
  step: string;
  /** One code, or alternatives joined by "|" (any of them passes). */
  expect: string;
  got: string;
  ok: boolean;
  detail?: string;
}

/** Thrown by `require` when a step the rest of a scenario stands on did not pass. */
export class ScenarioAborted extends Error {}

export class Steps {
  private readonly lines: StepLine[] = [];

  constructor(
    readonly scenario: string,
    private readonly write: (text: string) => void = (text) => process.stdout.write(`${text}\n`),
  ) {}

  /** Records one step; true when `got` is the expected answer (or one of them). */
  check(step: string, expect: string | readonly string[], got: string, detail?: string): boolean {
    const wanted = typeof expect === "string" ? [expect] : [...expect];
    const ok = wanted.includes(got);
    const line: StepLine = { scenario: this.scenario, step, expect: wanted.join("|"), got, ok };
    if (detail !== undefined) line.detail = detail;
    this.lines.push(line);
    this.write(JSON.stringify(line));
    return ok;
  }

  /** A step the rest of the scenario needs: when it fails, the scenario stops here. */
  require(step: string, expect: string | readonly string[], got: string, detail?: string): void {
    if (!this.check(step, expect, got, detail)) {
      throw new ScenarioAborted(`${step}: expected ${String(expect)}, got ${got}`);
    }
  }

  /** A failure outside any step (setup threw, the service went away). */
  broke(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ScenarioAborted) {
      this.write(JSON.stringify({ scenario: this.scenario, aborted: message }));
      return;
    }
    this.check("the scenario runs to its end", "ok", "error", message.slice(0, 500));
  }

  get failed(): number {
    return this.lines.filter((line) => !line.ok).length;
  }

  /** The summary line; true when every step passed (and there was at least one). */
  summary(): boolean {
    const ok = this.lines.length > 0 && this.failed === 0;
    const line = {
      scenario: this.scenario,
      summary: true,
      steps: this.lines.length,
      failed: this.failed,
      ok,
    };
    this.write(JSON.stringify(line));
    return ok;
  }
}
