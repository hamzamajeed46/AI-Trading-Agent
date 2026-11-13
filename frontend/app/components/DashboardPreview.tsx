import styles from "./DashboardPreview.module.css";

/*
 * Static, illustrative preview of the product UI. The numbers are example
 * data for the marketing page only -- nothing here calls the API.
 */

const W = 600;
const H = 220;
const PAD = 12;

// Example equity curve (arbitrary units). Includes a drawdown so the amber
// "loss" color has something to show.
const SERIES = [
  100, 101, 103, 102, 105, 108, 107, 111, 114, 112, 109, 105, 103, 106, 110, 115, 119, 118,
  122, 127, 125, 129, 134, 138,
];

function buildPaths() {
  const min = Math.min(...SERIES);
  const max = Math.max(...SERIES);
  const pts = SERIES.map((v, i) => {
    const x = PAD + (i / (SERIES.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H} Z`;
  // Highest point before the drawdown, and the trough, for the amber marker.
  const dd = pts
    .slice(9, 13)
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  return { line, area, dd };
}

const POSITIONS = [
  { sym: "AAPL", side: "BUY", pnl: "+4.82%", up: true, status: "Filled" },
  { sym: "NVDA", side: "BUY", pnl: "+2.10%", up: true, status: "Filled" },
  { sym: "TSLA", side: "SELL", pnl: "-1.35%", up: false, status: "Filled" },
  { sym: "MSFT", side: "BUY", pnl: "—", up: true, status: "Pending approval" },
];

export default function DashboardPreview() {
  const { line, area, dd } = buildPaths();

  return (
    <div className={`${styles.shell} glass`}>
      <div className={styles.topbar}>
        <span className={styles.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={`${styles.example} mono`}>EXAMPLE DATA · PAPER ACCOUNT</span>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Equity</span>
          <span className={`${styles.statValue} mono`}>
            <span data-count="138420" data-prefix="$">$138,420</span>
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>30-day return</span>
          <span className={`${styles.statValue} ${styles.gain} mono`}>
            <span data-count="12.4" data-decimals="1" data-prefix="+" data-suffix="%">
              +12.4%
            </span>
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Max drawdown</span>
          <span className={`${styles.statValue} ${styles.loss} mono`}>
            <span data-count="5.1" data-decimals="1" data-prefix="-" data-suffix="%">
              -5.1%
            </span>
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Awaiting you</span>
          <span className={`${styles.statValue} ${styles.pending} mono`}>
            <span data-count="1">1</span>
          </span>
        </div>
      </div>

      <div className={styles.body}>
        <figure className={styles.chart}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Example equity curve rising with one drawdown"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="dp-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1="0"
                x2={W}
                y1={H * f}
                y2={H * f}
                stroke="var(--chart-grid)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={area} fill="url(#dp-area)" />
            <path
              d={line}
              data-draw
              pathLength={1}
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={dd}
              fill="none"
              stroke="var(--chart-loss)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <figcaption className={styles.legend}>
            <span>
              <i className={styles.keyGain} /> Equity
            </span>
            <span>
              <i className={styles.keyLoss} /> Drawdown
            </span>
          </figcaption>
        </figure>

        <ul className={styles.table} data-reveal-group>
          {POSITIONS.map((p) => (
            <li key={p.sym} className={styles.row}>
              <span className={`${styles.sym} mono`}>{p.sym}</span>
              <span className={p.side === "BUY" ? styles.badgeGain : styles.badgeLoss}>
                {p.side}
              </span>
              <span
                className={`${styles.pnl} mono ${p.status === "Filled" ? (p.up ? styles.gain : styles.loss) : ""}`}
              >
                {p.pnl}
              </span>
              <span
                className={`${styles.status} ${p.status === "Filled" ? "" : styles.pending}`}
              >
                {p.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
