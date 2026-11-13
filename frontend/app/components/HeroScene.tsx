"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import styles from "./HeroScene.module.css";

/*
 * 3D candlestick field. Each candle has an open and a close sampled from a
 * drifting price wave; rising candles are teal, falling ones amber (the
 * app's gain/loss colors). The pointer pushes a swell of volatility through
 * the field. Purely decorative -- aria-hidden, no data.
 */

const SPACING = 0.55;
const BG = "#050810";
const TEAL = new THREE.Color("#19e3c3");
const AMBER = new THREE.Color("#ffb020");

type Density = { cols: number; rows: number };

function price(x: number, r: number, t: number) {
  return (
    1.3 +
    0.7 * Math.sin(x * 0.45 + t * 0.5 + r * 0.3) +
    0.35 * Math.sin(x * 1.3 - t * 0.35 + r * 0.8)
  );
}

function Candles({ cols, rows, animate }: Density & { animate: boolean }) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const wicks = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);

  // Scratch objects live in a ref: they're mutated every frame, never rendered.
  const scratch = useRef({
    obj: new THREE.Object3D(),
    color: new THREE.Color(),
    look: new THREE.Vector3(0, 2.6, -3),
    px: 0,
    pz: 0,
  });
  const count = cols * rows;

  const write = (t: number, pointerX: number, pointerY: number) => {
    const b = bodies.current;
    const w = wicks.current;
    if (!b || !w) return;
    const tmp = scratch.current;

    // Pointer -> world-space target on the field, eased so it glides.
    const halfW = (cols * SPACING) / 2;
    tmp.px += (pointerX * halfW * 0.7 - tmp.px) * 0.08;
    tmp.pz += (-(0.5 - pointerY * 0.5) * rows * SPACING - tmp.pz) * 0.08;

    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - cols / 2) * SPACING;
        const z = -r * SPACING;
        const dx = x - tmp.px;
        const dz = z - tmp.pz;
        const bump = Math.exp(-(dx * dx + dz * dz) / 2.4);

        const close = price(x, r, t) + bump * 0.9;
        const open = price(x, r, t - 0.4) + bump * 0.9;
        const lo = Math.min(open, close);
        const hi = Math.max(open, close);
        const bodyH = Math.max(hi - lo, 0.05);

        tmp.obj.position.set(x, lo + bodyH / 2, z);
        tmp.obj.scale.set(1, bodyH, 1);
        tmp.obj.updateMatrix();
        b.setMatrixAt(i, tmp.obj.matrix);

        tmp.obj.position.y = lo + bodyH / 2;
        tmp.obj.scale.set(1, bodyH + 0.35, 1);
        tmp.obj.updateMatrix();
        w.setMatrixAt(i, tmp.obj.matrix);

        tmp.color
          .copy(close >= open ? TEAL : AMBER)
          .multiplyScalar(0.5 + bump * 0.7);
        b.setColorAt(i, tmp.color);
        w.setColorAt(i, tmp.color);
        i++;
      }
    }
    b.instanceMatrix.needsUpdate = true;
    w.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    if (w.instanceColor) w.instanceColor.needsUpdate = true;
  };

  // Reduced motion: draw one still frame and stop.
  useEffect(() => {
    if (!animate) {
      write(2, 0, 0);
      invalidate();
    }
  });

  useFrame((state) => {
    // Direct mutation only: no React state in the render loop.
    const { camera, pointer, clock } = state;
    write(clock.elapsedTime, pointer.x, pointer.y);
    const s = Math.min(window.scrollY, 900);
    camera.position.x += (pointer.x * 0.9 - camera.position.x) * 0.04;
    camera.position.y += (3.4 + pointer.y * 0.5 - camera.position.y) * 0.04;
    camera.position.z += (7 + s * 0.006 - camera.position.z) * 0.06;
    camera.lookAt(scratch.current.look);
  });

  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.3, 1, 0.3]} />
        <meshStandardMaterial color="#ffffff" roughness={0.35} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={wicks} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.035, 1, 0.035]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </instancedMesh>
    </>
  );
}

function pickDensity(): Density {
  // Phones get a quarter of the geometry.
  return window.innerWidth < 640 ? { cols: 18, rows: 10 } : { cols: 36, rows: 16 };
}

export default function HeroScene() {
  // Safe to read window here: this component is only loaded client-side (ssr: false).
  const [reduceMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [density] = useState(pickDensity);
  const [visible, setVisible] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className={styles.scene} aria-hidden="true">
      <Canvas
        // "never" pauses the loop while off-screen; "demand" renders once and
        // idles (the reduced-motion still frame).
        frameloop={reduceMotion ? "demand" : visible ? "always" : "never"}
        dpr={density.cols < 36 ? [1, 1.25] : [1, 2]}
        camera={{ position: [0, 3.4, 7], fov: 52, near: 0.1, far: 50 }}
        gl={{ antialias: density.cols >= 36, alpha: true, powerPreference: "low-power" }}
      >
        <fog attach="fog" args={[BG, 6, 17]} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 6, 4]} intensity={2.2} color="#cfe0ff" />
        <Candles {...density} animate={!reduceMotion} />
      </Canvas>
    </div>
  );
}
