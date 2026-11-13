import Link from "next/link";
import styles from "./Pricing.module.css";

/*
 * PLACEHOLDER PLANS. The product has no billing yet -- tiers, prices and
 * feature lists below are design copy to be replaced with the real offer.
 */
const PLANS = [
  {
    name: "Paper",
    price: "$0",
    period: "forever",
    blurb: "Try the full pipeline against an Alpaca paper account.",
    features: ["Paper trading only", "Quant + bull/bear debate", "Manual approve / reject", "Community support"],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "per month",
    blurb: "For individuals who want every call analyzed and logged.",
    features: [
      "Everything in Paper",
      "Live account support",
      "Bracket orders with stop-loss & take-profit",
      "Approval history & export",
    ],
    cta: "Get Pro",
    featured: true,
  },
  {
    name: "Desk",
    price: "$99",
    period: "per month",
    blurb: "Multiple accounts and teammates sharing one approval queue.",
    features: ["Everything in Pro", "Multiple broker accounts", "Shared approval queue", "Priority support"],
    cta: "Contact us",
    featured: false,
  },
];

export default function Pricing() {
  return (
    <div className={styles.grid} data-reveal-group>
      {PLANS.map((plan) => (
        <article
          key={plan.name}
          className={`${styles.plan} glass ${plan.featured ? styles.featured : ""}`}
        >
          {plan.featured && <span className={styles.ribbon}>Most popular</span>}
          <h3 className={styles.name}>{plan.name}</h3>
          <p className={styles.blurb}>{plan.blurb}</p>
          <p className={styles.priceRow}>
            <span className={`${styles.price} mono`}>{plan.price}</span>
            <span className={styles.period}>{plan.period}</span>
          </p>
          <ul className={styles.features}>
            {plan.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <Link
            href="/signup"
            className={`btn ${plan.featured ? "btn-primary" : "btn-ghost"} ${styles.cta}`}
          >
            {plan.cta}
          </Link>
        </article>
      ))}
    </div>
  );
}
