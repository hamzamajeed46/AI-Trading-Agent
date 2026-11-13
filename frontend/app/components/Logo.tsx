"use client";

import { animate, stagger, type JSAnimation } from "animejs";
import { useEffect, useRef } from "react";
import styles from "./Logo.module.css";

/** Single source of truth for the product name. */
export const APP_NAME = "Quorum";
export const APP_TAGLINE = "AI Trading Agent";

/** Candlestick mark; same artwork as app/icon.svg. */
export function LogoMark({ size = 32 }: { size?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const anim = useRef<JSAnimation | null>(null);

  // Candles grow in one after another on load; hovering the logo replays it.
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const play = () => {
      anim.current?.revert();
      anim.current = animate(svg.querySelectorAll("[data-candle]"), {
        scaleY: [0, 1],
        opacity: [0, 1],
        delay: stagger(110),
        duration: 700,
        ease: "outBack",
      });
    };
    play();
    const host = svg.closest("a") ?? svg;
    host.addEventListener("mouseenter", play);
    return () => {
      host.removeEventListener("mouseenter", play);
      anim.current?.revert();
    };
  }, []);

  return (
    <svg
      ref={ref}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={styles.mark}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#101a30" />
          <stop offset="1" stopColor="#050810" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#logo-bg)" />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="13.25" fill="none" stroke="#4d8dff" strokeOpacity="0.35" strokeWidth="1.5" />
      <g data-candle>
        <line x1="19" y1="12" x2="19" y2="50" stroke="#ffb020" strokeWidth="3" strokeLinecap="round" />
        <rect x="13" y="20" width="12" height="16" rx="2.5" fill="#ffb020" />
      </g>
      <g data-candle>
        <line x1="32" y1="18" x2="32" y2="54" stroke="#19e3c3" strokeWidth="3" strokeLinecap="round" />
        <rect x="26" y="28" width="12" height="18" rx="2.5" fill="#19e3c3" />
      </g>
      <g data-candle>
        <line x1="45" y1="8" x2="45" y2="44" stroke="#19e3c3" strokeWidth="3" strokeLinecap="round" />
        <rect x="39" y="13" width="12" height="20" rx="2.5" fill="#19e3c3" />
      </g>
    </svg>
  );
}

export default function Logo() {
  return (
    <span className={styles.logo}>
      <LogoMark />
      <span className={styles.text}>
        <span className={styles.name}>{APP_NAME}</span>
        <span className={styles.tagline}>{APP_TAGLINE}</span>
      </span>
    </span>
  );
}
