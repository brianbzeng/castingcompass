import { RouteStateHeader } from "./components/RouteStateHeader";

export default function Loading() {
  return (
    <main className="route-state-page" aria-busy="true">
      <RouteStateHeader />

      <section className="route-state-card route-loading-card" aria-labelledby="route-loading-title">
        <p className="route-state-eyebrow">Preparing the forecast</p>
        <h1 id="route-loading-title">Checking the latest available conditions.</h1>
        <p className="route-state-copy" role="status" aria-live="polite">
          Loading forecast data. This may take a moment.
        </p>

        <div className="route-loading-grid" aria-hidden="true">
          <span className="route-loading-line route-loading-line-wide" />
          <span className="route-loading-line" />
          <span className="route-loading-panel" />
          <span className="route-loading-panel" />
          <span className="route-loading-panel" />
        </div>
      </section>
    </main>
  );
}
