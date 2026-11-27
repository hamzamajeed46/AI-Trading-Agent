"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ApiError,
  approveRecommendation,
  getBrokerStatus,
  getToken,
  listRecommendations,
  rejectRecommendation,
  startRecommendation,
  type RecommendationSummary,
} from "@/lib/api";
import RecommendationCard, { type Decision } from "@/app/components/RecommendationCard";
import styles from "./page.module.css";

function formatTimestamp(iso?: string | null): string {
  if (!iso) return "just now";
  return new Date(iso).toLocaleTimeString();
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [brokerConnected, setBrokerConnected] = useState<boolean | null>(null);

  const [pending, setPending] = useState<RecommendationSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [lastNonPending, setLastNonPending] = useState<RecommendationSummary | null>(null);

  const [respondingThread, setRespondingThread] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<RecommendationSummary | null>(null);

  // loadingList starts true (its useState initial value) and this is only
  // ever invoked once, from the mount effect below -- so there's no need to
  // (synchronously) set it back to true here too.
  function refreshPending() {
    listRecommendations("pending_approval")
      .then(setPending)
      .catch((err) => setListError(err instanceof ApiError ? err.message : "Failed to load recommendations."))
      .finally(() => setLoadingList(false));
  }

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
    refreshPending();
  }, [router]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setStartError(null);
    setLastNonPending(null);
    setLastOutcome(null);
    setStarting(true);
    try {
      const result = await startRecommendation(symbol.trim());
      setSymbol("");
      if (result.status === "pending_approval") {
        setPending((prev) => [result, ...prev]);
      } else {
        // HOLD (or an edge case that ended without ever reaching approval) --
        // nothing to approve, just show what the graph concluded.
        setLastNonPending(result);
      }
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setStarting(false);
    }
  }

  async function handleRespond(threadId: string, decision: "approve" | "reject") {
    setRespondingThread(threadId);
    setLastOutcome(null);
    try {
      const result =
        decision === "approve" ? await approveRecommendation(threadId) : await rejectRecommendation(threadId);
      setPending((prev) => prev.filter((r) => r.thread_id !== threadId));
      setLastOutcome(result);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setRespondingThread(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.formCard}>
        <span className={`${styles.eyebrow} mono`}>[ APPROVALS ]</span>
        <h1>Start a recommendation</h1>
        <p className={styles.helpText}>
          Runs the full quant + bull/bear + PM debate against your connected Alpaca account. A
          confident BUY/SELL call pauses here for your approval before anything is sized into a
          real bracket order — reject it, and it never touches your account. A HOLD call ends
          immediately, with nothing to approve.
        </p>

        {brokerConnected === false && (
          <p className={styles.brokerPrompt}>
            No Alpaca account connected yet —{" "}
            <a href="/broker" style={{ textDecoration: "underline" }}>
              connect one
            </a>{" "}
            before starting a recommendation.
          </p>
        )}

        <form className={styles.form} onSubmit={handleStart}>
          <input
            type="text"
            placeholder="AAPL"
            required
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            disabled={starting}
          />
          <button type="submit" className="btn btn-primary" disabled={starting}>
            {starting ? "Running..." : "Start"}
          </button>
        </form>

        {starting && (
          <p className={styles.loading}>
            Debating against live Alpaca data via Groq — a full run (up to 3 rounds) typically
            takes 30-90 seconds.
          </p>
        )}
        {startError && <p className="form-error">{startError}</p>}

        {lastNonPending && (
          <div className={styles.holdResult}>
            <span className={`${styles.holdBadge} mono`}>{lastNonPending.symbol}</span>
            <span>
              Result: <strong>{lastNonPending.decision}</strong> at{" "}
              {Math.round(lastNonPending.confidence * 100)}% confidence —{" "}
              {lastNonPending.status === "avoid"
                ? "bearish, but you don't hold this, so there's nothing to sell. Avoid buying it for now."
                : "nothing to approve."}
            </span>
          </div>
        )}

        {lastOutcome && (
          <div className={lastOutcome.status === "submitted" ? styles.outcomeSuccess : styles.outcomeNeutral}>
            {lastOutcome.status === "submitted" && (
              <>✓ Order submitted for {lastOutcome.symbol} (Alpaca order {lastOutcome.order_id}).</>
            )}
            {lastOutcome.status === "rejected" && <>Recommendation for {lastOutcome.symbol} rejected — no order placed.</>}
            {lastOutcome.status === "failed" && (
              <>
                Approved, but order submission failed for {lastOutcome.symbol}:{" "}
                {lastOutcome.execution_error}
              </>
            )}
          </div>
        )}
      </div>

      <div className={styles.listSection}>
        <span className={styles.sectionLabel}>
          Pending approval {pending.length > 0 && `(${pending.length})`}
        </span>

        {listError && <p className="form-error">{listError}</p>}

        {loadingList ? (
          <p className={styles.loading}>Loading...</p>
        ) : pending.length === 0 ? (
          <p className={styles.empty}>Nothing awaiting approval right now.</p>
        ) : (
          <div className={styles.cardGrid}>
            <AnimatePresence mode="popLayout">
            {pending.map((rec) => (
              <motion.div
                key={rec.thread_id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              >
              <RecommendationCard
                ticker={rec.symbol}
                decision={rec.decision as Decision}
                confidence={Math.round(rec.confidence * 100)}
                rationale={rec.rationale}
                timestamp={formatTimestamp(rec.created_at)}
                pending
                orderDetails={{
                  qty: rec.proposed_qty,
                  entryPrice: rec.entry_price_hint,
                  stopPrice: rec.stop_price,
                  takeProfitPrice: rec.take_profit_price,
                  timeline: rec.recommended_timeline,
                }}
                warning={
                  rec.decision === "SELL"
                    ? `Approving sells your ${rec.proposed_qty} held shares at market price. No stop-loss or take-profit applies, because you are closing the position.`
                    : rec.symbol.includes("/")
                    ? "Alpaca doesn't support bracket orders for crypto — approving submits a plain market order with no automatic stop-loss/take-profit. The stop/take-profit above are informational only; you'd need to monitor and exit manually."
                    : undefined
                }
                onApprove={() => handleRespond(rec.thread_id, "approve")}
                onReject={() => handleRespond(rec.thread_id, "reject")}
                actionsDisabled={respondingThread === rec.thread_id}
              />
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
