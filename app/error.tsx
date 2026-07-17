"use client";

import Link from "next/link";
import { RouteStateHeader } from "./components/RouteStateHeader";

export default function RouteError({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <main className="route-state-page">
      <RouteStateHeader />

      <section
        className="route-state-card route-error-card"
        role="alert"
        aria-labelledby="route-error-title"
      >
        <p className="route-state-eyebrow">Page interrupted</p>
        <h1 id="route-error-title">This page could not finish loading.</h1>
        <p className="route-state-copy">
          You can retry loading the page. If an account action was already in progress,
          verify its status before submitting it again.
        </p>
        <div className="route-state-actions">
          <button className="route-state-action route-state-action-primary" type="button" onClick={reset}>
            Try again
          </button>
          <Link className="route-state-action route-state-action-secondary" href="/">
            Return to the forecast
          </Link>
        </div>
      </section>
    </main>
  );
}
