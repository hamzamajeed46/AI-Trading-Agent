"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ApiError,
  analyzeSymbolStream,
  getBrokerStatus,
  getToken,
  type AnalyzeResponse,
  type Decision,
} from "@/lib/api";
import ConfidenceMeter from "@/app/components/ConfidenceMeter";
import Markdown from "@/app/components/Markdown";
import styles from "./page.module.css";

const DECISION_STYLE: Record<Decision, string> = {
  BUY: styles.decisionBuy,
  SELL: styles.decisionSell,
  HOLD: styles.decisionHold,
};

const METER_COLOR: Record<Decision, string> = {
  BUY: "var(--color-buy)",
  SELL: "var(--color-sell)",
  HOLD: "var(--foreground-muted)",
};

function formatMetric(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value}${suffix}`;
}

type Verdict = { decision: Decision; confidence: number; rationale: string };

export default function AnalyzePage() {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [brokerConnected, setBrokerConnected] = useState<boolean | null>(null);

  const [assetName, setAssetName] = useState<string | null>(null);
  const [priceAtCall, setPriceAtCall] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<AnalyzeResponse["metrics"] | null>(null);
  const [bullArgs, setBullArgs] = useState<string[]>([]);
  const [bearArgs, setBearArgs] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    getBrokerStatus()
      .then((status) => setBrokerConnected(status.connected))
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.push("/login");
        }
      });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setError(null);
    setAssetName(null);
    setPriceAtCall(null);
    setMetrics(null);
    setBullArgs([]);
    setBearArgs([]);
    setVerdict(null);
    setDone(false);
    setStreaming(true);
    try {
      await analyzeSymbolStream(symbol.trim(), (update) => {
        if (update.quant) {
          setAssetName(update.quant.asset_name);
          setPriceAtCall(update.quant.price_at_call);
          setMetrics(update.quant.metrics);
        }
        if (update.bull) {
          setBullArgs((prev) => [...prev, ...update.bull!.bull_args]);
        }
        if (update.bear) {
          setBearArgs((prev) => [...prev, ...update.bear!.bear_args]);
        }
        if (update.pm) {
          setVerdict(update.pm);
        }
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setStreaming(false);
    }
  }

  const roundCount = Math.max(bullArgs.length, bearArgs.length);

  return (
    <div className={styles.wrap}>
      <div className={styles.formCard}>
        <span className={`${styles.eyebrow} mono`}>[ SIGNAL ANALYSIS ]</span>
        <h1>Analyze a symbol</h1>

        {brokerConnected === false && (
          <p className={styles.brokerPrompt}>
            No Alpaca account connected yet —{" "}
            <a href="/broker" style={{ textDecoration: "underline" }}>
              connect one
            </a>{" "}
            before running an analysis.
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="AAPL"
            required
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            disabled={streaming}
          />
          <button type="submit" className="btn btn-primary" disabled={streaming}>
            {streaming ? "Analyzing..." : "Analyze"}
          </button>
        </form>

        {streaming && (
          <p className={styles.loading}>
            Streaming the bull/bear/PM debate against live Alpaca data via Groq as each
            round completes — a full run (up to 3 rounds) typically takes 30-90 seconds.
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>

      {(metrics || verdict) && (
        <div className={styles.resultCard}>
          <div className={styles.resultHeader}>
            <span className={`${styles.symbol} mono`}>{symbol.trim().toUpperCase()}</span>
            {verdict ? (
              <span className={`${styles.decisionBadge} ${DECISION_STYLE[verdict.decision]}`}>
                {verdict.decision}
              </span>
            ) : (
              <span className={styles.liveTag}>
                <span className="pulse-dot" aria-hidden="true" />
                DEBATING
              </span>
            )}
          </div>
          {assetName && (
            <p className={styles.assetName}>
              {assetName}
              {" — "}
              double-check this is the instrument you meant; some tickers (e.g. crypto
              abbreviations) resolve to unrelated equities/ETFs on Alpaca&apos;s stock API.
            </p>
          )}

          {metrics && (
            <div className={styles.metricsGrid}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Price</span>
                <span className="mono">${priceAtCall?.toFixed(2)}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Trend</span>
                <span className="mono">{formatMetric(metrics.trend_pct, "%")}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Volatility</span>
                <span className="mono">{formatMetric(metrics.volatility_pct, "%")}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>SMA 20 / 50</span>
                <span className="mono">
                  {formatMetric(metrics.sma_20)} / {formatMetric(metrics.sma_50)}
                </span>
              </div>
            </div>
          )}

          {verdict && (
            <>
              <ConfidenceMeter confidence={verdict.confidence} color={METER_COLOR[verdict.decision]} />
              <div className={styles.rationale}>
                {!done && (
                  <span className={styles.provisionalTag}>PROVISIONAL — debate may continue </span>
                )}
                <Markdown>{verdict.rationale}</Markdown>
              </div>
            </>
          )}

          {roundCount > 0 && (
            <div className={styles.transcript}>
              <span className={styles.roundLabel}>
                Debate transcript ({roundCount} round{roundCount === 1 ? "" : "s"}
                {!done ? ", live" : ""})
              </span>
              {Array.from({ length: roundCount }, (_, i) => (
                <div key={i}>
                  <span className={styles.roundLabel}>Round {i + 1}</span>
                  {bullArgs[i] && (
                    <div className={`${styles.argument} ${styles.argumentBull}`}>
                      <span className={styles.argumentLabel}>BULL — </span>
                      <Markdown>{bullArgs[i]}</Markdown>
                    </div>
                  )}
                  {bearArgs[i] ? (
                    <div className={`${styles.argument} ${styles.argumentBear}`}>
                      <span className={styles.argumentLabel}>BEAR — </span>
                      <Markdown>{bearArgs[i]}</Markdown>
                    </div>
                  ) : bullArgs[i] ? (
                    <div className={`${styles.argument} ${styles.argumentPending}`}>
                      Waiting for the bear analyst...
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
