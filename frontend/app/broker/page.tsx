"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ApiError,
  connectBroker,
  getBrokerStatus,
  getToken,
  type BrokerMode,
  type BrokerStatus,
} from "@/lib/api";
import styles from "./page.module.css";

export default function BrokerPage() {
  const router = useRouter();
  const [status, setStatus] = useState<BrokerStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [mode, setMode] = useState<BrokerMode>("paper");
  const [error, setError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    getBrokerStatus()
      .then(setStatus)
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.push("/login");
        }
      })
      .finally(() => setLoadingStatus(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setJustConnected(false);
    setSubmitting(true);
    try {
      const result = await connectBroker(apiKey, secretKey, mode);
      setStatus(result);
      setApiKey("");
      setSecretKey("");
      setJustConnected(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <span className={`${styles.eyebrow} mono`}>[ BROKER CONNECTION ]</span>
        <h1>Connect your Alpaca account</h1>
        <p className={styles.helpText}>
          Use your own Alpaca API key/secret (Trading API, paper trading is free and
          doesn&apos;t need identity verification). Keys are encrypted before being
          stored and are never shown back to you.
        </p>

        {loadingStatus ? (
          <span className={styles.statusChip}>
            <span className={styles.statusDot} aria-hidden="true" />
            <span className={styles.statusTextMuted}>Checking status...</span>
          </span>
        ) : status?.connected ? (
          <span className={styles.statusChip}>
            <span className={`${styles.statusDot} ${styles.statusDotActive}`} aria-hidden="true" />
            <span className={`${styles.statusTextActive} mono`}>
              CONNECTED — {status.provider?.toUpperCase()} · {status.mode?.toUpperCase()}
            </span>
          </span>
        ) : (
          <span className={styles.statusChip}>
            <span className={styles.statusDot} aria-hidden="true" />
            <span className={styles.statusTextMuted}>No broker connected yet</span>
          </span>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="apiKey">
              API key
            </label>
            <input
              id="apiKey"
              type="text"
              required
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="secretKey">
              Secret key
            </label>
            <input
              id="secretKey"
              type="password"
              required
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Mode</span>
            <div className={styles.modeToggle} role="radiogroup" aria-label="Trading mode">
              <button
                type="button"
                role="radio"
                aria-checked={mode === "paper"}
                className={`${styles.modeButton} ${mode === "paper" ? styles.modeButtonPaperActive : ""}`}
                onClick={() => setMode("paper")}
              >
                Paper
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "live"}
                className={`${styles.modeButton} ${mode === "live" ? styles.modeButtonLiveActive : ""}`}
                onClick={() => setMode("live")}
              >
                Live
              </button>
            </div>
            <span className={mode === "live" ? `${styles.modeHint} ${styles.modeHintLive}` : styles.modeHint}>
              {mode === "live"
                ? "Live mode places real orders against real capital in your Alpaca account."
                : "Paper mode simulates trades with fake money — no financial risk."}
            </span>
          </div>
          {error && <p className="form-error">{error}</p>}
          {justConnected && !error && (
            <p className={styles.statusTextActive}>
              ✓ Connected — your keys were encrypted and stored.
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Connecting..." : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
