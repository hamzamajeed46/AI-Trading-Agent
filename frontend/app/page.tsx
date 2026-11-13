"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getToken, me, type User } from "@/lib/api";
import DashboardPreview from "./components/DashboardPreview";
import HeroSceneLoader from "./components/HeroSceneLoader";
import Pricing from "./components/Pricing";
import RecommendationCard from "./components/RecommendationCard";
import { useScrollReveal } from "./components/useScrollReveal";
import styles from "./page.module.css";

// Simple inline icons (stroke = currentColor) so there is no icon dependency.
const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const FEATURES = [
  {
    title: "Quant analysis",
    body: "Pulls daily bars, volume, volatility and moving averages from Alpaca's market-data API for your connected account.",
    icon: icon(<path d="M3 17l5-5 4 4 8-9M15 7h5v5" />),
  },
  {
    title: "Bull vs. bear debate",
    body: "Two LLM agents with live market-data tools argue for and against the trade, rebutting each other for up to three rounds when confidence is too low.",
    icon: icon(<><path d="M4 5h11v8H8l-4 3V5z" /><path d="M20 10v9l-4-3h-6v-3" /></>),
  },
  {
    title: "Portfolio manager",
    body: "A third agent weighs both sides into a BUY, HOLD or SELL call with a confidence score and written rationale.",
    icon: icon(<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>),
  },
  {
    title: "You decide",
    body: "The LangGraph pipeline hits a real interrupt() and freezes — persisted to disk — until you approve or reject. Reject it and nothing touches your account.",
    icon: icon(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>),
  },
  {
    title: "Bracket orders",
    body: "Approved non-HOLD calls become a real bracket order with a stop-loss and take-profit attached.",
    icon: icon(<><path d="M4 7h16M4 17h16" /><path d="M12 7v10" /></>),
  },
  {
    title: "Paper by default",
    body: "Connect an Alpaca paper account and try everything without risking real capital.",
    icon: icon(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>),
  },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useScrollReveal(wrapRef);

  useEffect(() => {
    const check = getToken() ? me() : Promise.resolve(null);
    check.then(setUser).finally(() => setChecked(true));
  }, []);

  const cta = (
    <div className={styles.ctaRow}>
      {checked && user ? (
        <Link href="/broker" className="btn btn-primary btn-lg">
          Go to Broker
        </Link>
      ) : (
        <>
          <Link href="/signup" className="btn btn-primary btn-lg">
            Sign up
          </Link>
          <Link href="/login" className="btn btn-ghost btn-lg">
            Log in
          </Link>
        </>
      )}
    </div>
  );

  return (
    <div className={styles.wrap} ref={wrapRef}>
      {/* ---------------------------------------------------------- Hero */}
      <section className={styles.hero} data-hero>
        <HeroSceneLoader />
        <div className={styles.heroText} data-hero-text>
          <p className={styles.pill} data-hero-in>
            <span className="pulse-dot" aria-hidden="true" /> Multi-agent trading analyst
          </p>
          <h1 className={styles.h1} data-hero-in>
            Four agents argue every trade. <span className={styles.gradientText}>You cast the deciding vote.</span>
          </h1>
          <p className={styles.lede} data-hero-in>
            A quant node reads live price, volume and volatility. A bull and a bear agent
            debate it. A portfolio manager makes the call — then the graph pauses.
            Nothing reaches your paper account until you approve it.
          </p>
          <div data-hero-in>{cta}</div>
        </div>
        <div className={styles.heroCard} data-hero-card>
          <div data-hero-in className={styles.heroCardInner}>
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
        </div>
      </section>

      {/* ------------------------------------------------------ Features */}
      <section className={styles.section} id="features">
        <header className={styles.head} data-reveal>
          <p className={styles.eyebrow}>Features</p>
          <h2>What it actually does</h2>
          <p className={styles.sub}>
            Every step of the decision is visible, debatable and — critically — yours to
            overrule.
          </p>
        </header>
        <div className={styles.features} data-reveal-group>
          {FEATURES.map((f) => (
            <article key={f.title} className={`${styles.feature} glass`}>
              <span className={styles.featureIcon}>{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- Pipeline */}
      <section className={styles.section}>
        <header className={styles.head} data-reveal>
          <p className={styles.eyebrow}>Approval</p>
          <h2>What &ldquo;approval&rdquo; concretely means</h2>
          <p className={styles.sub}>
            This isn&apos;t a disclaimer — it&apos;s how the graph is built. After the
            portfolio manager decides, execution hits a real{" "}
            <code className="mono">interrupt()</code> and is persisted until your
            approve/reject call resumes it.
          </p>
        </header>
        <div className={styles.flow} data-flow>
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

      {/* ------------------------------------------------- Dashboard */}
      <section className={styles.section}>
        <header className={styles.head} data-reveal>
          <p className={styles.eyebrow}>Dashboard</p>
          <h2>Everything in one place</h2>
          <p className={styles.sub}>
            Track equity, drawdown and the calls waiting on you. Gains in teal, losses in
            amber, pending decisions in violet.
          </p>
        </header>
        <div data-reveal>
          <DashboardPreview />
        </div>
      </section>

      {/* --------------------------------------------------- Pricing */}
      <section className={styles.section} id="pricing">
        <header className={styles.head} data-reveal>
          <p className={styles.eyebrow}>Pricing</p>
          <h2>Start on paper, scale when you&apos;re ready</h2>
        </header>
        <Pricing />
      </section>

      {/* ----------------------------------------------------- Footer */}
      <footer className={`${styles.footer} glass`} data-reveal>
        <h2>Ready to put the agents to work?</h2>
        {checked && (
          <p className={styles.sub}>
            {user ? (
              <>
                Signed in as <span className="mono">{user.email}</span>. Head to{" "}
                <Link href="/broker" className={styles.link}>
                  Broker
                </Link>{" "}
                to connect or check your Alpaca account.
              </>
            ) : (
              <>
                <Link href="/signup" className={styles.link}>
                  Sign up
                </Link>{" "}
                or{" "}
                <Link href="/login" className={styles.link}>
                  log in
                </Link>{" "}
                to connect your own Alpaca paper account and try it for real.
              </>
            )}
          </p>
        )}
      </footer>
    </div>
  );
}
