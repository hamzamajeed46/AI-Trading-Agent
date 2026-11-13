"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import styles from "./HeroScene.module.css";

// Three.js + R3F are only fetched when the device can actually use them.
const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

type NavigatorHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

/** True when the WebGL scene would be wasted or harmful on this device. */
function isLowPower(): boolean {
  const nav = navigator as NavigatorHints;
  if (nav.connection?.saveData) return true;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return true;
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) return true;
  try {
    const canvas = document.createElement("canvas");
    return !(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return true;
  }
}

/** CSS-only stand-in: a row of pulsing candles. No JS animation, no WebGL. */
function HeroFallback() {
  const bars = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div className={`${styles.scene} ${styles.fallback}`} aria-hidden="true">
      {bars.map((i) => (
        <span
          key={i}
          className={`${styles.bar} ${i % 3 === 1 ? styles.barDown : ""}`}
          style={{
            height: `${22 + ((i * 37) % 46)}%`,
            animationDelay: `${(i % 9) * -0.55}s`,
          }}
        />
      ))}
    </div>
  );
}

// Detected once, in the browser (this module is itself loaded with ssr: false).
export default function HeroBackdrop() {
  const [lowPower] = useState(isLowPower);
  return lowPower ? <HeroFallback /> : <HeroScene />;
}
