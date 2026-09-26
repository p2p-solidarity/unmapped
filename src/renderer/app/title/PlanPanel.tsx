// Settings → Advanced settings → Plan (rev 6 phase 4, D3): the billing provider's plans exactly as it names and prices
// them (`GET /v1/plans` through main), or the error it answers — `billing-not-configured` when the
// gateway sells nothing, `gateway-not-configured` when this build has no gateway at all. Never idle
// and never a made-up plan or price (Rule 2). Checkout and the customer portal open in the system
// browser; the app never sees a payment detail.

import { formatNumber, type Translate, useLanguageStore, useT } from "@renderer/i18n";
import { Button, ErrorBlock, StatePanel, space, Text } from "@renderer/ui";
import type { BillingPlan, PlansResponse } from "@shared/billing";
import { type AppError, fromResult, type Loadable, loading, type Result } from "@shared/result";
import { type JSX, useEffect, useState } from "react";
import { useQuota } from "./useGateway";

/**
 * The provider's amount (in the currency's minor unit) in the UI language. The currency is a
 * well-formed ISO 4217 code (`billingPlanSchema`), which Intl formats; an unknown one keeps two
 * minor digits, Intl's own default.
 */
function money(plan: BillingPlan, language: string): string {
  const format = new Intl.NumberFormat(language, {
    style: "currency",
    currency: plan.currency.toUpperCase(),
  });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(plan.amount / 10 ** digits);
}

function priceLine(plan: BillingPlan, language: string, t: Translate): string {
  const price = money(plan, language);
  if (plan.intervalCount === 1) {
    if (plan.interval === "day") return t("account.planPerDay", { price });
    if (plan.interval === "week") return t("account.planPerWeek", { price });
    if (plan.interval === "month") return t("account.planPerMonth", { price });
    return t("account.planPerYear", { price });
  }
  const unit =
    plan.interval === "day"
      ? t("account.unitDays")
      : plan.interval === "week"
        ? t("account.unitWeeks")
        : plan.interval === "month"
          ? t("account.unitMonths")
          : t("account.unitYears");
  return t("account.planEvery", { price, n: plan.intervalCount, unit });
}

export function PlanPanel(): JSX.Element {
  const t = useT();
  const language = useLanguageStore((state) => state.language);
  const [plans, setPlans] = useState<Loadable<PlansResponse>>(loading());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [opened, setOpened] = useState(false);
  // The current plan is the quota's (a provider price id), read only when there are plans to match.
  const quota = useQuota(plans.status === "ready" && plans.value.plans.length > 0);
  const current =
    quota.status === "ready" && quota.value.quota.plan !== null ? quota.value.quota.plan : null;

  useEffect(() => {
    let alive = true;
    void window.seed.gateway.plans().then((result) => {
      if (alive) setPlans(fromResult(result));
    });
    return () => {
      alive = false;
    };
  }, []);

  const open = async (action: () => Promise<Result<void>>) => {
    setBusy(true);
    setError(null);
    setOpened(false);
    const result = await action();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setOpened(true);
  };

  return (
    <section data-plans="" style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
      <Text variant="label">{t("account.planHeading")}</Text>
      <StatePanel state={plans} loadingText={t("account.planReading")}>
        {(value) => (
          <>
            <Text variant="caption" tone="dim">
              {t("account.planProvider", { provider: value.provider })}
            </Text>
            {value.mode === "test" ? (
              <Text variant="caption" tone="accent">
                {t("account.planTestMode")}
              </Text>
            ) : null}
            {value.plans.length === 0 ? (
              <Text variant="caption" tone="dim">
                {t("account.planNone")}
              </Text>
            ) : null}
            {value.plans.map((plan) => (
              <div
                key={plan.id}
                data-plan={plan.id}
                style={{ display: "flex", flexDirection: "column", gap: space.xs }}
              >
                <Text variant="body">{plan.name}</Text>
                <Text variant="caption">{priceLine(plan, language, t)}</Text>
                <Text variant="caption" tone="dim">
                  {t("account.planCredits", { credits: formatNumber(plan.credits) })}
                </Text>
                {current === plan.id ? (
                  <Text variant="caption" tone="success">
                    {t("account.planCurrent")}
                  </Text>
                ) : (
                  <div>
                    <Button
                      disabled={busy}
                      onClick={() => void open(() => window.seed.gateway.checkout(plan.id))}
                    >
                      {t("account.subscribe")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
            <div>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void open(() => window.seed.gateway.portal())}
              >
                {t("account.manage")}
              </Button>
            </div>
          </>
        )}
      </StatePanel>
      {opened ? (
        <Text variant="caption" tone="success">
          {t("account.opened")}
        </Text>
      ) : null}
      {error !== null ? <ErrorBlock error={error} /> : null}
    </section>
  );
}
