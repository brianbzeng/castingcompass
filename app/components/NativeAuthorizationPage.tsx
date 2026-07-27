"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  parseNativeAuthorizationRequest,
  verifiedNativeAuthorizationCallback,
} from "../../shared/native-authorize-browser.ts";
import type { FishingSite } from "../types";
import { AccountModal, useAccount } from "./AccountFeature";

type AuthorizationState = "idle" | "submitting" | "error";
const NATIVE_AUTHORIZATION_TIMEOUT_MS = 15_000;

export function NativeAuthorizationPage({ sites }: { sites: FishingSite[] }) {
  const account = useAccount();
  const [search, setSearch] = useState<string | null>(null);
  const [authorizationState, setAuthorizationState] = useState<AuthorizationState>("idle");
  const [message, setMessage] = useState("");
  const request = useMemo(
    () => search === null ? null : parseNativeAuthorizationRequest(search),
    [search],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentSearch = window.location.search;
      window.history.replaceState(null, "", window.location.pathname);
      setSearch(currentSearch);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const continueToApp = async () => {
    if (!request || !account.user?.legalAccepted || authorizationState === "submitting") return;
    setAuthorizationState("submitting");
    setMessage("Requesting a one-use sign-in code. Keep this browser open.");
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      NATIVE_AUTHORIZATION_TIMEOUT_MS,
    );
    try {
      const response = await fetch("/api/native/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        const errorMessage = body && typeof body === "object" && !Array.isArray(body)
          && typeof (body as { error?: { message?: unknown } }).error?.message === "string"
          ? (body as { error: { message: string } }).error.message
          : "The app sign-in request was not accepted.";
        throw new Error(errorMessage);
      }
      const callback = verifiedNativeAuthorizationCallback(body, request);
      if (!callback) throw new Error("The app callback could not be verified.");
      setMessage("Sign-in confirmed. Returning to the CastingCompass app…");
      window.location.assign(callback);
    } catch (error) {
      setAuthorizationState("error");
      setMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "The sign-in service took too long to respond. Try again from the app."
          : error instanceof Error
            ? error.message
            : "The app sign-in request failed.",
      );
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const loading = search === null || account.loading;
  const invalid = search !== null && request === null;

  return (
    <main className="native-authorization-page">
      <section className="native-authorization-card" aria-labelledby="native-authorization-title">
        <Link className="native-authorization-brand" href="/" aria-label="CastingCompass home">
          CastingCompass
        </Link>
        <span className="eyebrow"><span /> Secure app sign-in</span>
        <h1 id="native-authorization-title">Continue to<br />CastingCompass.</h1>
        {loading ? (
          <p role="status">Checking this browser session…</p>
        ) : invalid ? (
          <>
            <p role="alert">
              This app sign-in link is incomplete or malformed. No account credential was issued.
            </p>
            <p className="native-authorization-note">
              Close this browser and begin sign-in again from the CastingCompass app.
            </p>
          </>
        ) : !account.user ? (
          <>
            <p>
              Sign in on castingcompass.com first. Your password stays in this system browser and
              is never sent to the app.
            </p>
            <button
              className="native-authorization-primary"
              type="button"
              onClick={() => account.openAccount("Sign in to continue securely to the CastingCompass app.")}
            >
              Sign in
            </button>
          </>
        ) : !account.user.legalAccepted ? (
          <>
            <p>
              This account must accept the current Terms and Privacy Policy before app access can
              continue.
            </p>
            <button
              className="native-authorization-primary"
              type="button"
              onClick={() => account.openAccount("Accept the current legal terms before continuing to the app.")}
            >
              Review account
            </button>
          </>
        ) : (
          <>
            <p>
              Signed in as <strong>{account.user.email}</strong>. The app is requesting permission
              to read your basic profile and submit or manage only your own fishing trips.
            </p>
            <ul>
              <li>No password or browser cookie is shared with the app.</li>
              <li>The one-use code expires in five minutes.</li>
              <li>You can sign out or revoke app access at any time.</li>
            </ul>
            <button
              className="native-authorization-primary"
              type="button"
              disabled={authorizationState === "submitting"}
              onClick={() => void continueToApp()}
            >
              {authorizationState === "submitting" ? "Continuing…" : "Continue to app"}
            </button>
            <button
              className="native-authorization-secondary"
              type="button"
              disabled={authorizationState === "submitting"}
              onClick={() => account.openAccount("Review this account before continuing to the app.")}
            >
              Review account
            </button>
          </>
        )}
        {message ? (
          <p
            className="native-authorization-status"
            role={authorizationState === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
        <p className="native-authorization-note">
          If you did not start this request in the CastingCompass app, close this browser.
        </p>
      </section>
      <AccountModal
        key={account.user?.id ?? "anonymous"}
        account={account}
        sites={sites}
      />
    </main>
  );
}
