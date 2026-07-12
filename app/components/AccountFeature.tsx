"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CloseIcon } from "./icons";
import type { FishingSite } from "../types";

export interface AccountUser {
  id: string;
  email: string;
}

export interface AccountController {
  user: AccountUser | null;
  loading: boolean;
  savedSiteIds: Set<string>;
  modalOpen: boolean;
  modalMessage: string;
  openAccount(message?: string): void;
  closeAccount(): void;
  signOut(): Promise<void>;
  toggleSavedSite(siteId: string): Promise<boolean>;
  refresh(): Promise<void>;
}

interface ProfileTrip {
  id: string;
  source: "live" | "past_report";
  site_id: string;
  started_at: string;
  ended_at: string | null;
  mode: string;
  fishing_method: string | null;
  angler_hours: number | null;
  keeper_count: number | null;
  short_released_count: number | null;
  halibut_encounters: number | null;
  no_catch: number | null;
  moderation_status: string;
  opportunity_score: number | null;
}

interface ProfileData {
  savedSites: Array<{ site_id: string; created_at: string }>;
  trips: ProfileTrip[];
}

export function useAccount(): AccountController {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedSiteIds, setSavedSiteIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const body = await response.json() as { user?: AccountUser | null };
      const nextUser = response.ok ? body.user ?? null : null;
      setUser(nextUser);
      if (!nextUser) {
        setSavedSiteIds(new Set());
        return;
      }
      const savedResponse = await fetch("/api/saved-sites", { cache: "no-store" });
      const savedBody = await savedResponse.json() as { siteIds?: string[] };
      setSavedSiteIds(new Set(savedResponse.ok ? savedBody.siteIds ?? [] : []));
    } catch {
      setUser(null);
      setSavedSiteIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const openAccount = useCallback((message = "") => {
    setModalMessage(message);
    setModalOpen(true);
  }, []);

  const closeAccount = useCallback(() => {
    setModalOpen(false);
    setModalMessage("");
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    setSavedSiteIds(new Set());
    closeAccount();
  }, [closeAccount]);

  const toggleSavedSite = useCallback(async (siteId: string) => {
    if (!user) {
      openAccount("Sign in to save fishing locations across devices.");
      return false;
    }
    const wasSaved = savedSiteIds.has(siteId);
    const response = await fetch(`/api/saved-sites/${encodeURIComponent(siteId)}`, {
      method: wasSaved ? "DELETE" : "POST",
    });
    if (!response.ok) return false;
    setSavedSiteIds((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
    return true;
  }, [openAccount, savedSiteIds, user]);

  return {
    user,
    loading,
    savedSiteIds,
    modalOpen,
    modalMessage,
    openAccount,
    closeAccount,
    signOut,
    toggleSavedSite,
    refresh,
  };
}

type AccountMode = "login" | "signup" | "verify" | "recover" | "reset";

export function AccountModal({ account, sites }: { account: AccountController; sites: FishingSite[] }) {
  const [mode, setMode] = useState<AccountMode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!account.modalOpen || !account.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    const timer = window.setTimeout(() => {
      void fetch("/api/profile", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Profile could not be loaded.");
          return response.json() as Promise<ProfileData>;
        })
        .then((data) => {
          if (!cancelled) setProfile(data);
        })
        .catch(() => {
          if (!cancelled) setProfile({ savedSites: [], trips: [] });
        })
        .finally(() => {
          if (!cancelled) setProfileLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [account.modalOpen, account.user]);

  if (!account.modalOpen) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const endpoint = mode === "signup"
        ? "/api/auth/signup/request"
        : mode === "verify"
          ? "/api/auth/signup/verify"
          : mode === "recover"
            ? "/api/auth/password/request"
            : mode === "reset"
              ? "/api/auth/password/reset"
              : "/api/auth/login";
      const payload = mode === "verify"
        ? { challengeId, code: form.get("code") }
        : mode === "reset"
          ? { challengeId, code: form.get("code"), password: form.get("password") }
          : { email: form.get("email"), password: form.get("password") };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { challengeId?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The account request failed.");
      if ((mode === "signup" || mode === "recover") && body.challengeId) {
        setChallengeId(body.challengeId);
        setMode(mode === "signup" ? "verify" : "reset");
        return;
      }
      await account.refresh();
      account.closeAccount();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The account request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-modal-layer" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) account.closeAccount();
    }}>
      <section className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className="sheet-close" type="button" onClick={account.closeAccount} aria-label="Close account"><CloseIcon /></button>
        {account.user ? (
          <>
            <span className="eyebrow"><span /> Your account</span>
            <h2 id="account-title">Your fishing<br />profile.</h2>
            <p className="account-email">Signed in as <strong>{account.user.email}</strong></p>
            <div className="profile-summary" aria-live="polite">
              <div><strong>{profile?.savedSites.length ?? 0}</strong><span>Saved locations</span></div>
              <div><strong>{profile?.trips.length ?? 0}</strong><span>Completed trips</span></div>
            </div>
            <section className="profile-section">
              <h3>Saved locations</h3>
              {profileLoading ? <p>Loading your saved water…</p> : profile?.savedSites.length ? (
                <div className="profile-list">
                  {profile.savedSites.map((saved) => {
                    const site = sites.find((candidate) => candidate.id === saved.site_id);
                    return <div className="profile-row" key={saved.site_id}><strong>{site?.name ?? saved.site_id}</strong><span>{site?.region ?? "Bay Area"}</span></div>;
                  })}
                </div>
              ) : <p>No saved locations yet. Open a forecast and tap “Save location.”</p>}
            </section>
            <section className="profile-section">
              <h3>Past trip logs</h3>
              {profileLoading ? <p>Loading trip history…</p> : profile?.trips.length ? (
                <div className="profile-list">
                  {profile.trips.map((trip) => {
                    const site = sites.find((candidate) => candidate.id === trip.site_id);
                    const encounters = Number(trip.halibut_encounters ?? 0);
                    return (
                      <article className="profile-trip" key={trip.id}>
                        <div><strong>{site?.name ?? trip.site_id}</strong><span>{new Date(trip.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>
                        <p>{encounters > 0 ? `${encounters} halibut encounter${encounters === 1 ? "" : "s"}` : "Skunk logged"} · {Number(trip.angler_hours ?? 0).toFixed(1)} angler-hours</p>
                        <small>{trip.moderation_status === "pending" ? "Awaiting dataset review" : trip.moderation_status}</small>
                      </article>
                    );
                  })}
                </div>
              ) : <p>No completed trip logs are attached to this account yet.</p>}
            </section>
            <button className="account-primary account-signout" type="button" onClick={() => void account.signOut()}>Sign out</button>
          </>
        ) : (
          <>
            <span className="eyebrow"><span /> CastCompass beta</span>
            <h2 id="account-title">{
              mode === "login" ? "Welcome back."
                : mode === "signup" ? "Create an account."
                  : mode === "verify" ? "Check your email."
                    : mode === "recover" ? "Reset your password."
                      : "Enter your reset code."
            }</h2>
            <p>{account.modalMessage || "Save locations and contribute trip reports to improve the forecast."}</p>
            {mode === "login" || mode === "signup" ? (
              <div className="account-tabs" role="tablist" aria-label="Account action">
                <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Sign in</button>
                <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); }}>Create account</button>
              </div>
            ) : null}
            <form onSubmit={submit}>
              {mode !== "verify" && mode !== "reset" ? <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label> : null}
              {mode === "login" || mode === "signup" || mode === "reset" ? <label>{mode === "reset" ? "New password" : "Password"}<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={10} maxLength={128} /></label> : null}
              {mode === "verify" || mode === "reset" ? <label>Six-digit email code<input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} pattern="[0-9]{6}" /></label> : null}
              {mode === "signup" ? <small>Use at least 10 characters. We’ll email a six-digit code before creating the account.</small> : null}
              {mode === "verify" || mode === "reset" ? <small>The code expires after 15 minutes and can be tried six times.</small> : null}
              {error ? <p className="account-error" role="alert">{error}</p> : null}
              <button className="account-primary" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Email verification code" : mode === "verify" ? "Verify and create account" : mode === "recover" ? "Email reset code" : "Set new password"}</button>
            </form>
            {mode === "login" ? <button className="account-text-button" type="button" onClick={() => { setMode("recover"); setError(""); }}>Forgot password?</button> : null}
            {mode === "recover" || mode === "verify" || mode === "reset" ? <button className="account-text-button" type="button" onClick={() => { setMode("login"); setError(""); setChallengeId(""); }}>Back to sign in</button> : null}
          </>
        )}
      </section>
    </div>
  );
}
