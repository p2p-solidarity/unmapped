// Settings → Advanced settings → Account (rev 6 phase 4, D1): this device's account on the generation gateway. Signed
// out: sign in with the device key, or join an existing account with a pairing code shown beside
// this device's key and fingerprint (main polls for the approval by itself). Signed in: the
// allowance as a share plus the gateway's credits and this computer's own tokens and calls (never
// money), the account's devices and approving a new one. No gateway configured → the error state
// with its hint (Rule 2). Tokens never reach this screen (Rule 6); nothing on the walking path waits
// for any of it.

import { formatDateTime, formatNumber, formatTime, useT } from "@renderer/i18n";
import { Button, ErrorBlock, StatePanel, space, Text } from "@renderer/ui";
import type { AccountStatus, QuotaView } from "@shared/gatewayApi";
import {
  type AppError,
  fromResult,
  idle,
  type Loadable,
  loading,
  type Result,
} from "@shared/result";
import { type JSX, useCallback, useEffect, useState } from "react";
import { AccountDevices } from "./AccountDevices";
import { percentLeft, useQuota } from "./useGateway";

function QuotaBlock({ view }: { view: QuotaView }): JSX.Element {
  const t = useT();
  const { quota, device } = view;
  return (
    <div data-quota="" style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <Text variant="label">{t("account.quotaHeading", { period: quota.period })}</Text>
      <Text variant="body" tone={quota.granted > 0 && percentLeft(view) > 0 ? "default" : "danger"}>
        {quota.granted > 0
          ? t("account.quotaLeft", { percent: percentLeft(view) })
          : t("account.quotaNone")}
      </Text>
      <Text variant="caption" tone="dim" mono>
        {t("account.quotaCredits", {
          used: formatNumber(quota.used),
          granted: formatNumber(quota.granted),
          reserved: formatNumber(quota.reserved),
          date: formatDateTime(quota.resetsAt),
        })}
      </Text>
      <Text variant="caption" tone="dim">
        {t("account.quotaDevice", {
          calls: device.calls,
          input: formatNumber(device.input),
          output: formatNumber(device.output),
        })}
      </Text>
      {device.unreported > 0 ? (
        <Text variant="caption" tone="dim">
          {t("account.quotaUnreported", { n: device.unreported })}
        </Text>
      ) : null}
      {quota.plan !== null ? (
        <Text variant="caption" tone="dim">
          {t("account.quotaPlan", { plan: quota.plan })}
        </Text>
      ) : null}
    </div>
  );
}

function SignedOut({
  status,
  busy,
  run,
}: {
  status: AccountStatus;
  busy: boolean;
  run(action: () => Promise<Result<AccountStatus>>): Promise<boolean>;
}): JSX.Element {
  const t = useT();
  const pairing = status.pairing;
  const ended = status.session.state === "signed-out" && status.session.ended;
  return (
    <div
      data-account="signed-out"
      style={{ display: "flex", flexDirection: "column", gap: space.sm }}
    >
      <Text variant="body" tone={ended ? "danger" : "default"}>
        {ended ? t("account.ended") : t("account.signedOut")}
      </Text>
      {pairing === null ? (
        <>
          <Text variant="caption" tone="dim">
            {t("account.signInNote")}
          </Text>
          <div>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void run(() => window.seed.gateway.signIn())}
            >
              {t("account.signIn")}
            </Button>
          </div>
          <Text variant="caption" tone="dim">
            {t("account.joinIntro")}
          </Text>
          <div>
            <Button
              disabled={busy}
              onClick={() => void run(() => window.seed.gateway.requestPairing())}
            >
              {t("account.requestCode")}
            </Button>
          </div>
        </>
      ) : (
        <div data-pairing="" style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
          <Text variant="label">
            {t("account.codeHeading", { time: formatTime(pairing.expiresAt) })}
          </Text>
          <Text variant="title" mono>
            {`${pairing.code.slice(0, 4)} ${pairing.code.slice(4)}`}
          </Text>
          <Text variant="caption" tone="dim">
            {t("account.codeSteps")}
          </Text>
          <Text variant="caption" tone="accent" mono>
            {`${t("account.fingerprint")}: ${pairing.fingerprint}`}
          </Text>
          <Text variant="caption" tone="muted">
            {t("account.waiting")}
          </Text>
          <div>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => window.seed.gateway.cancelPairing())}
            >
              {t("account.cancelCode")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SignedIn({
  status,
  busy,
  run,
}: {
  status: AccountStatus & { session: { state: "signed-in" } };
  busy: boolean;
  run(action: () => Promise<Result<AccountStatus>>): Promise<boolean>;
}): JSX.Element {
  const t = useT();
  const quota = useQuota(true);
  const { session } = status;
  return (
    <div
      data-account="signed-in"
      style={{ display: "flex", flexDirection: "column", gap: space.sm }}
    >
      <Text variant="body" tone="success">
        {session.source === "env"
          ? t("account.signedInEnv", { account: session.account })
          : t("account.signedIn", { account: session.account })}
      </Text>
      <StatePanel state={quota} loadingText={t("account.reading")}>
        {(view) => <QuotaBlock view={view} />}
      </StatePanel>
      <AccountDevices status={status} run={run} />
      {session.source === "saved" ? (
        <div>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void run(() => window.seed.gateway.signOut())}
          >
            {t("account.signOut")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AccountPanel(): JSX.Element {
  const t = useT();
  const [status, setStatus] = useState<Loadable<AccountStatus>>(idle());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const read = useCallback(async () => {
    const result = await window.seed.gateway.account().catch((thrown: unknown) => ({
      ok: false as const,
      error: { code: "account-failed", message: String(thrown) },
    }));
    setStatus(fromResult(result));
  }, []);

  useEffect(() => {
    setStatus(loading());
    void read();
    return window.seed.gateway.onChanged(() => void read());
  }, [read]);

  const run = useCallback(
    async (action: () => Promise<Result<AccountStatus>>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      const result = await action();
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setStatus(fromResult(result));
      return true;
    },
    [],
  );

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
      <Text variant="label">{t("account.heading")}</Text>
      <Text variant="caption" tone="dim">
        {t("account.intro")}
      </Text>
      <StatePanel state={status} loadingText={t("account.reading")}>
        {(value) => (
          <>
            <Text variant="caption" tone="dim" mono>
              {t("account.gateway", { url: value.gateway })}
            </Text>
            <Text variant="caption" tone="dim" mono>
              {t("account.thisDevice", { fingerprint: value.device.fingerprint })}
            </Text>
            {value.session.state === "signed-in" ? (
              <SignedIn
                status={value as AccountStatus & { session: { state: "signed-in" } }}
                busy={busy}
                run={run}
              />
            ) : (
              <SignedOut status={value} busy={busy} run={run} />
            )}
          </>
        )}
      </StatePanel>
      {error !== null ? <ErrorBlock error={error} /> : null}
    </section>
  );
}
