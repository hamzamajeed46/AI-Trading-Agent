"use client";

import { useEffect, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Wires GSAP/ScrollTrigger animations for everything under `root`, driven by
 * data attributes so markup stays declarative:
 *
 *   data-hero / data-hero-text / data-hero-card  hero parallax (scrubbed)
 *   data-hero-in                                  hero entrance stagger
 *   data-reveal                                   fade + rise once on enter
 *   data-reveal-group                             same, staggered per child
 *   data-flow                                     children light up on scroll
 *   data-draw                                     SVG path draws itself
 *   data-count="82" [data-decimals][data-prefix][data-suffix]   count-up
 *
 * Nothing runs under prefers-reduced-motion; the markup is already in its
 * final state, so the page is complete without any of this.
 */
export function useScrollReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();

    const ctx = gsap.context(() => {
      const once = (trigger: Element, start = "top 88%") => ({
        trigger,
        start,
        once: true,
      });

      // Hero entrance.
      gsap.from("[data-hero-in]", {
        opacity: 0,
        y: 32,
        duration: 0.9,
        stagger: 0.12,
        ease: "power3.out",
        delay: 0.1,
      });

      // Hero parallax: scrubbed to the scrollbar. Desktop only -- on phones the
      // hero stacks and the extra motion just fights the scroll.
      const hero = el.querySelector<HTMLElement>("[data-hero]");
      if (hero) {
        mm.add("(min-width: 900px)", () => {
          const parallax = (sel: string, y: number) =>
            gsap.to(sel, {
              y,
              opacity: 0.2,
              ease: "none",
              scrollTrigger: {
                trigger: hero,
                start: "top top",
                end: "bottom top",
                scrub: 0.6,
              },
            });
          parallax("[data-hero-text]", -60);
          parallax("[data-hero-card]", -120);
        });
      }

      // Single elements.
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((node) => {
        gsap.from(node, {
          opacity: 0,
          y: 28,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: once(node),
        });
      });

      // Staggered children (feature cards, pricing tiers, table rows...).
      gsap.utils.toArray<HTMLElement>("[data-reveal-group]").forEach((group) => {
        gsap.from(group.children, {
          opacity: 0,
          y: 24,
          duration: 0.7,
          stagger: 0.1,
          ease: "power2.out",
          scrollTrigger: once(group),
        });
      });

      // Pipeline diagram: steps light up in order as it scrolls through view.
      const flow = el.querySelector<HTMLElement>("[data-flow]");
      if (flow) {
        gsap.set(flow.children, { opacity: 0.25 });
        gsap
          .timeline({
            scrollTrigger: { trigger: flow, start: "top 85%", end: "top 40%", scrub: 0.8 },
          })
          .to(flow.children, { opacity: 1, stagger: 0.25, ease: "none" });
      }

      // Chart lines draw themselves (paths use pathLength="1").
      gsap.utils.toArray<SVGGeometryElement>("[data-draw]").forEach((path) => {
        gsap.fromTo(
          path,
          { strokeDasharray: 1, strokeDashoffset: 1 },
          {
            strokeDashoffset: 0,
            duration: 1.8,
            ease: "power2.inOut",
            scrollTrigger: once(path, "top 85%"),
          },
        );
      });

      // Count-up numbers; the final value is already in the markup.
      gsap.utils.toArray<HTMLElement>("[data-count]").forEach((node) => {
        const end = Number(node.dataset.count);
        if (Number.isNaN(end)) return;
        const decimals = Number(node.dataset.decimals ?? 0);
        const prefix = node.dataset.prefix ?? "";
        const suffix = node.dataset.suffix ?? "";
        const state = { v: 0 };
        // Same formatting as the server-rendered markup (thousands separators).
        const fmt = (n: number) =>
          `${prefix}${n.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}${suffix}`;
        gsap.to(state, {
          v: end,
          duration: 1.6,
          ease: "power2.out",
          scrollTrigger: once(node, "top 92%"),
          onStart: () => {
            node.textContent = fmt(0);
          },
          onUpdate: () => {
            node.textContent = fmt(state.v);
          },
        });
      });
    }, el);

    return () => {
      ctx.revert();
      mm.revert();
    };
  }, [root]);
}
