"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { ApiError, login, signup } from "@/lib/api";
import { findCountry } from "@/lib/countries";
import CountrySelect from "@/app/components/CountrySelect";
import styles from "@/app/styles/auth-card.module.css";

export default function SignupPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [countryCode, setCountryCode] = useState<CountryCode | "">("");
  const [nationalNumber, setNationalNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const selectedCountry = countryCode ? findCountry(countryCode) : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let phoneNumber: string | undefined;
    if (nationalNumber.trim()) {
      if (!selectedCountry) {
        setError("Select a country first.");
        return;
      }
      // Parsing the national-format number with the country as context (rather
      // than string-concatenating "+<code>" + digits ourselves) matters: some
      // countries write local numbers with a leading trunk digit (e.g. the UK's
      // "0") that has to be stripped for E.164, and libphonenumber knows the
      // per-country rule for that -- naive concatenation would not.
      const parsed = parsePhoneNumberFromString(nationalNumber, selectedCountry.code);
      if (!parsed?.isValid()) {
        setError(`Enter a valid phone number for ${selectedCountry.name}.`);
        return;
      }
      phoneNumber = parsed.number;
    }

    setSubmitting(true);
    try {
      await signup({
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        country: selectedCountry?.name ?? "",
      });
      // Sign up doesn't log you in server-side (it's a separate call) --
      // log in immediately after so the new user lands authenticated.
      await login(email, password);
      router.push("/broker");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.card}>
      <span className={`${styles.eyebrow} mono`}>[ REGISTER ]</span>
      <h1>Sign up</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="firstName">
              First name
            </label>
            <input
              id="firstName"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="lastName">
              Last name
            </label>
            <input
              id="lastName"
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="country">
            Country <span className={styles.optionalTag}>(where you&apos;re trading from)</span>
          </label>
          <CountrySelect
            id="country"
            required
            value={countryCode}
            onChange={(country) => setCountryCode(country.code)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="phoneNumber">
            Phone number <span className={styles.optionalTag}>(optional)</span>
          </label>
          <div className={styles.phoneField}>
            <span className={`${styles.phoneCode} mono`}>
              {selectedCountry ? `+${selectedCountry.callingCode}` : "+--"}
            </span>
            <input
              id="phoneNumber"
              type="tel"
              disabled={!selectedCountry}
              placeholder={selectedCountry ? "555 123 4567" : "Select a country first"}
              value={nationalNumber}
              onChange={(e) => setNationalNumber(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Signing up..." : "Sign up"}
        </button>
      </form>
      <p className={styles.footer}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}
