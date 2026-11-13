"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearToken, getToken, me, type User } from "@/lib/api";
import Logo from "./Logo";
import styles from "./NavBar.module.css";

export default function NavBar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Re-check on every route change, not just once on mount -- NavBar lives
    // in the root layout and persists across client-side navigations, so a
    // mount-only check would never notice a login/logout that happened on
    // another page (it'd keep showing whatever state was true when the
    // layout first mounted, e.g. "Signed out" forever after logging in).
    const check = getToken() ? me() : Promise.resolve(null);
    check
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, [pathname]);

  function handleLogout() {
    clearToken();
    setUser(null);
    router.push("/login");
  }

  function navLink(href: string, label: string) {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`${styles.link} ${active ? styles.linkActive : ""}`}
        aria-current={active ? "page" : undefined}
      >
        {label}
        {active && (
          // Shared layoutId: the underline glides from the old link to the new one.
          <motion.span
            layoutId="nav-underline"
            className={styles.underline}
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
          />
        )}
      </Link>
    );
  }

  return (
    <nav className={styles.navbar}>
      <Link href="/" className={styles.brand} aria-label="Quorum home">
        <Logo />
      </Link>

      <div className={styles.right}>
        <div className={styles.links}>
          {navLink("/analyze", "Analyze")}
          {navLink("/approvals", "Approvals")}
          {navLink("/broker", "Broker")}
        </div>

        <div className={styles.divider} aria-hidden="true" />

        {loading ? (
          <div className={styles.session} />
        ) : user ? (
          <div className={styles.session}>
            <span className={styles.sessionChip}>
              <span
                className={`${styles.sessionDot} ${styles.sessionDotActive}`}
                aria-hidden="true"
              />
              <span className={`${styles.sessionText} mono`}>{user.email}</span>
            </span>
            <button className={styles.logoutButton} onClick={handleLogout}>
              Log out
            </button>
          </div>
        ) : (
          <div className={styles.session}>
            <span className={styles.sessionChip}>
              <span className={styles.sessionDot} aria-hidden="true" />
              <span className={styles.sessionText}>Signed out</span>
            </span>
            <div className={styles.authLinks}>
              <Link href="/login" className="btn btn-ghost">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Sign up
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
