import ConfidenceMeter from "./ConfidenceMeter";
import Markdown from "./Markdown";
import styles from "./RecommendationCard.module.css";

export type Decision = "BUY" | "SELL";

export type OrderDetails = {
  qty: number | null;
  entryPrice: number | null;
  stopPrice: number | null;
  takeProfitPrice: number | null;
  timeline: string | null;
};

type RecommendationCardProps = {
  ticker: string;
  decision: Decision;
  confidence: number;
  rationale: string;
  timestamp: string;
  live?: boolean;
  pending?: boolean;
  orderDetails?: OrderDetails;
  warning?: string;
  onApprove?: () => void;
  onReject?: () => void;
  actionsDisabled?: boolean;
};

export default function RecommendationCard({
  ticker,
  decision,
  confidence,
  rationale,
  timestamp,
  live = false,
  pending = true,
  orderDetails,
  warning,
  onApprove,
  onReject,
  actionsDisabled = false,
}: RecommendationCardProps) {
  const meterColor = decision === "BUY" ? "var(--color-buy)" : "var(--color-sell)";
  const interactive = Boolean(onApprove || onReject);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.tickerRow}>
          <span className={`${styles.ticker} mono`}>{ticker}</span>
          <span className={`${styles.badge} ${decision === "BUY" ? styles.badgeBuy : styles.badgeSell}`}>
            {decision}
          </span>
        </div>
        {live ? (
          <span className={styles.liveTag}>
            <span className="pulse-dot" aria-hidden="true" />
            LIVE
          </span>
        ) : (
          <span className={`${styles.timestamp} mono`}>{timestamp}</span>
        )}
      </div>

      <ConfidenceMeter confidence={confidence} color={meterColor} />

      <div className={`${styles.rationale} mono`}>
        <Markdown>{rationale}</Markdown>
      </div>

      {orderDetails && (
        <div className={styles.orderDetails}>
          <div className={styles.orderDetail}>
            <span className={styles.orderDetailLabel}>Qty</span>
            <span className="mono">{orderDetails.qty ?? "—"}</span>
          </div>
          <div className={styles.orderDetail}>
            <span className={styles.orderDetailLabel}>Entry</span>
            <span className="mono">
              {orderDetails.entryPrice != null ? `$${orderDetails.entryPrice.toFixed(2)}` : "—"}
            </span>
          </div>
          <div className={styles.orderDetail}>
            <span className={styles.orderDetailLabel}>Stop</span>
            <span className="mono" style={{ color: "var(--color-sell)" }}>
              {orderDetails.stopPrice != null ? `$${orderDetails.stopPrice.toFixed(2)}` : "—"}
            </span>
          </div>
          <div className={styles.orderDetail}>
            <span className={styles.orderDetailLabel}>Take-profit</span>
            <span className="mono" style={{ color: "var(--color-buy)" }}>
              {orderDetails.takeProfitPrice != null ? `$${orderDetails.takeProfitPrice.toFixed(2)}` : "—"}
            </span>
          </div>
          <div className={styles.orderDetail}>
            <span className={styles.orderDetailLabel}>Timeline</span>
            <span className="mono">{orderDetails.timeline ?? "—"}</span>
          </div>
        </div>
      )}

      {warning && <div className={styles.warningStrip}>{warning}</div>}

      {pending && (
        <div className={styles.pendingStrip}>
          <span className={styles.pendingDot} aria-hidden="true" />
          PENDING APPROVAL — awaiting your decision
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.actionButton} ${styles.approve} ${interactive ? styles.interactive : ""}`}
          onClick={onApprove}
          disabled={actionsDisabled || !onApprove}
          aria-label={onApprove ? "Approve" : "Approve (example)"}
        >
          Approve
        </button>
        <button
          type="button"
          className={`${styles.actionButton} ${styles.reject} ${interactive ? styles.interactive : ""}`}
          onClick={onReject}
          disabled={actionsDisabled || !onReject}
          aria-label={onReject ? "Reject" : "Reject (example)"}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
