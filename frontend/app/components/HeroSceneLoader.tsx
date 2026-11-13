"use client";

import dynamic from "next/dynamic";

// Client-only: device detection needs `window`, and keeping it out of the SSR
// pass keeps the first paint light.
const HeroBackdrop = dynamic(() => import("./HeroBackdrop"), { ssr: false });

export default function HeroSceneLoader() {
  return <HeroBackdrop />;
}
