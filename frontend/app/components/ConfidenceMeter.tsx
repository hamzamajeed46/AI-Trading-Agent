import styles from "./ConfidenceMeter.module.css";

const SEGMENTS = 10;

type ConfidenceMeterProps = {
  confidence: number; // 0-100
  color?: string; // CSS color value, e.g. "var(--color-buy)"
  label?: string;
};

export default function ConfidenceMeter({
  confidence,
  color = "var(--color-buy)",
  label = "Confidence",
}: ConfidenceMeterProps) {
  const filled = Math.round((confidence / 100) * SEGMENTS);

  return (
    <div className={styles.wrap}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.meter} role="img" aria-label={`${confidence}% confidence`}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={`${styles.segment} ${i < filled ? styles.segmentFilled : ""}`}
            style={i < filled ? ({ "--meter-color": color } as React.CSSProperties) : undefined}
          />
        ))}
      </div>
      <span className={`${styles.value} mono`}>{confidence}%</span>
    </div>
  );
}
