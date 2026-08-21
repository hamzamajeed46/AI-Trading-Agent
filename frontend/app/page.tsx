"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getToken, me, type User } from "@/lib/api";
import RecommendationCard from "./components/RecommendationCard";
import styles from "./page.module.css";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const check = getToken() ? me() : Promise.resolve(null);
    check.then(setUser).finally(() => setChecked(true));
  }, []);

  return (
    <div className={styles.wrap}>
      <section className={styles.hero}>
        <div className={styles.heroCard}>
          <RecommendationCard
            ticker="AAPL"
            decision="BUY"
            confidence={82}
            rationale="> raised on above-average volume + bullish 20/50-day MA crossover"
            timestamp="14:32:07"
            live
            pending
          />
        </div>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Multi-agent trading analyst</p>
          <h1>Four agents argue every trade. You cast the deciding vote.</h1>
          <p>
            A quant node pulls live price, volume, and volatility from your connected
            Alpaca account. A bull agent and a bear agent debate what it means. A
            portfolio-manager agent weighs both sides into a BUY, HOLD, or SELL call with
            a confidence score — then the graph literally pauses mid-execution. Nothing
            reaches your paper account until you approve or reject it.
          </p>
          <div className={styles.ctaRow}>
            {checked && user ? (
              <Link href="/broker" className="btn btn-primary">
                Go to Broker
              </Link>
            ) : (
              <>
                <Link href="/signup" className="btn btn-primary">
                  Sign up
                </Link>
                <Link href="/login" className="btn btn-ghost">
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>What it actually watches</h2>
        <div className={styles.tickerList}>
          <div className={styles.tickerRow}>
            <span className={styles.tickerLabel}>WATCHES</span>
            <span className={styles.tickerDesc}>
              Streams daily bars, volatility, and moving averages from Alpaca&apos;s market
              data API for your connected account — paper by default, so nothing here
              risks real capital.
            </span>
          </div>
          <div className={styles.tickerRow}>
            <span className={styles.tickerLabel}>DEBATES</span>
            <span className={styles.tickerDesc}>
              A bull agent and a bear agent, each backed by an LLM with live market-data
              tools, argue for and against the position — rebutting each other for up to
              three rounds if the resulting confidence is too low to act on.
            </span>
          </div>
          <div className={styles.tickerRow}>
            <span className={styles.tickerLabel}>HOLDS</span>
            <span className={styles.tickerDesc}>
              Every non-HOLD call — a real bracket order with a stop-loss and take-profit
              attached — sits pending until you explicitly approve or reject it. Reject
              it, and it never touches your account.
            </span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>What &ldquo;approval&rdquo; concretely means</h2>
        <p style={{ color: "var(--foreground-muted)", marginBottom: "1.25rem", lineHeight: 1.6 }}>
          This isn&apos;t a disclaimer — it&apos;s how the underlying graph is built. The
          decision pipeline is a LangGraph state machine that hits a real{" "}
          <code className="mono">interrupt()</code> after the portfolio-manager agent
          decides. Execution is frozen — persisted to disk, not just paused in memory —
          until your approve/reject call resumes it.
        </p>
        <div className={styles.flow}>
          <span className={styles.flowStep}>Quant</span>
          <span className={styles.flowArrow}>→</span>
          <span className={styles.flowStep}>Bull ⇄ Bear</span>
          <span className={styles.flowArrow}>→</span>
          <span className={styles.flowStep}>Portfolio Manager</span>
          <span className={styles.flowArrow}>→</span>
          <span className={`${styles.flowStep} ${styles.flowStepPending}`}>
            interrupt() — you decide
          </span>
          <span className={styles.flowArrow}>→</span>
          <span className={styles.flowStep}>Bracket order</span>
        </div>
      </section>

      <footer className={styles.footer}>
        {checked && (
          <p>
            {user ? (
              <>
                Signed in as <span className="mono">{user.email}</span>. Head to{" "}
                <Link href="/broker">Broker</Link> to connect or check your Alpaca
                account.
              </>
            ) : (
              <>
                <Link href="/signup">Sign up</Link> or{" "}
                <Link href="/login">log in</Link> to connect your own Alpaca paper
                account and try it for real.
              </>
            )}
          </p>
        )}
      </footer>
    </div>
  );
}
