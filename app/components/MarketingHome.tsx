"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  joinMarketingMailingList,
  loadApprovedCatchReports,
  loadMarketingCommunity,
  loadMarketingOpportunity,
  requestBrowserLocation,
  type DataState,
  type LocationState,
  type MarketingCatchReport,
  type MarketingCommunityThread,
  type MarketingOpportunity,
} from "./marketing-home-data";
import { HeroTopographicArt, TopographicLoader } from "./TopographicTransition";

const navItems = [
  ["Home", "/"],
  ["Spots", "/forecast"],
  ["Reports", "/community"],
  ["Maps", "/forecast"],
  ["Community", "/community"],
] as const;

const approachCards = [
  {
    number: "01",
    title: "Find top spots",
    copy: "Compare public shore, pier, beach, and jetty options near you.",
  },
  {
    number: "02",
    title: "Read live conditions",
    copy: "See tide, wind, swell, and source freshness in plain language.",
  },
  {
    number: "03",
    title: "Pick one target",
    copy: "Keep one species in focus and swap targets without rebuilding the trip.",
  },
  {
    number: "04",
    title: "Check local reports",
    copy: "Add recent public-place context before you decide whether to make the drive.",
  },
] as const;

type IntroState = "drawing" | "revealing" | "settled";
const INTRO_REVEAL_DELAY_MS = 1000;
const INTRO_FALLBACK_SETTLE_MS = 3400;

type CommunityResult = {
  threads: MarketingCommunityThread[];
  scope: "local" | "service";
  siteName?: string;
};

function Icon({
  children,
  size = 20,
  viewBox = "0 0 24 24",
}: {
  children: ReactNode;
  size?: number;
  viewBox?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox={viewBox}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {children}
    </svg>
  );
}

function ArrowIcon() {
  return (
    <Icon size={18}>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </Icon>
  );
}

function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Icon>
  );
}

function CompassLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`cc-brand${compact ? " cc-brand-compact" : ""}`} href="/">
      <Image
        src="/castingcompass-icon.png"
        width={44}
        height={44}
        alt=""
        priority={!compact}
        unoptimized
      />
      <span>CastingCompass</span>
    </Link>
  );
}

function formatNumber(value: number | null, suffix: string) {
  return value === null
    ? "Not available"
    : `${Math.round(value * 10) / 10}${suffix}`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatWindow(opportunity: MarketingOpportunity) {
  const start = new Date(opportunity.start);
  const end = new Date(opportunity.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Window time unavailable";
  }
  const startText = new Intl.DateTimeFormat(undefined, {
    weekday: opportunity.timing === "active" ? undefined : "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(start);
  const endText = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(end);
  return `${startText}–${endText}`;
}

function ForecastCard({
  state,
  location,
}: {
  state: DataState<MarketingOpportunity>;
  location: LocationState;
}) {
  if (state.status === "loading") {
    return (
      <aside className="cc-forecast-card cc-data-card-state" aria-live="polite">
        <span className="cc-data-spinner" aria-hidden="true" />
        <strong>Finding your best California halibut window</strong>
        <p>
          {location.status === "loading"
            ? "Checking location permission…"
            : "Reading current options…"}
        </p>
      </aside>
    );
  }

  if (state.status === "error" || state.status === "empty") {
    return (
      <aside className="cc-forecast-card cc-data-card-state" aria-live="polite">
        <strong>Planning window unavailable</strong>
        <p>{state.message}</p>
        <Link href="/forecast">
          Open the full forecast <ArrowIcon />
        </Link>
      </aside>
    );
  }

  const opportunity = state.data;
  const timingLabel =
    opportunity.timing === "active"
      ? "Best active window"
      : opportunity.timing === "upcoming"
        ? "Next strong window"
        : "Latest available window";
  const scopeLabel =
    opportunity.scope === "local"
      ? "Near your location"
      : location.status === "denied"
        ? "Service-wide fallback · location denied"
        : "Service-wide fallback";

  return (
    <aside
      className="cc-forecast-card"
      aria-label="California halibut planning window"
    >
      <header>
        <div>
          <span>California halibut</span>
          <strong>{opportunity.siteName}</strong>
        </div>
        <span className="cc-forecast-status">{scopeLabel}</span>
      </header>
      <div className="cc-opportunity-score">
        <div>
          <span>Opportunity score</span>
          <strong>
            {opportunity.score}
            <small>/100</small>
          </strong>
        </div>
        <p>
          {timingLabel}
          <strong>{formatWindow(opportunity)}</strong>
        </p>
      </div>
      <dl>
        <div>
          <dt>Wind</dt>
          <dd>{formatNumber(opportunity.windMph, " mph")}</dd>
        </div>
        <div>
          <dt>Swell</dt>
          <dd>{formatNumber(opportunity.swellFeet, " ft")}</dd>
        </div>
        <div>
          <dt>Tide</dt>
          <dd>{opportunity.tideStage ?? "Not available"}</dd>
        </div>
      </dl>
      <p className="cc-forecast-freshness">
        Data timestamp:{" "}
        <time dateTime={opportunity.generatedAt}>
          {formatTimestamp(opportunity.generatedAt)}
        </time>
      </p>
      <p className="cc-forecast-disclosure">
        Relative rank among available options—not a catch probability or
        guarantee.
      </p>
    </aside>
  );
}

function Header() {
  return (
    <header className="cc-navbar">
      <CompassLogo />
      <nav aria-label="Primary navigation">
        {navItems.map(([label, href]) => (
          <Link
            key={label}
            href={href}
            aria-current={label === "Home" ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="cc-nav-actions">
        <Link
          className="cc-search-link"
          href="/forecast"
          aria-label="Search fishing spots"
        >
          <SearchIcon />
        </Link>
        <Link className="cc-sign-in" href="/profile">
          Sign in
        </Link>
        <Link className="cc-sign-up" href="/profile">
          Create account
        </Link>
      </div>
    </header>
  );
}

function RecentReports({
  state,
}: {
  state: DataState<MarketingCatchReport[]>;
}) {
  return (
    <section className="cc-reports" aria-labelledby="cc-reports-title">
      <header>
        <h2 id="cc-reports-title">Recent Catch Reports</h2>
      </header>
      {state.status === "loading" && (
        <div className="cc-reports-state" aria-live="polite">
          <span className="cc-data-spinner" aria-hidden="true" />
          <p>Checking for approved catch photos…</p>
        </div>
      )}
      {state.status === "error" && (
        <div className="cc-reports-state" role="status">
          <strong>Catch reports are temporarily unavailable.</strong>
          <p>{state.message}</p>
        </div>
      )}
      {state.status === "empty" && (
        <div className="cc-reports-state" role="status">
          <strong>No approved catch photos yet.</strong>
          <p>
            Reviewed community images will appear here automatically when they
            are available.
          </p>
        </div>
      )}
      {state.status === "ready" && (
        <div className="cc-report-grid">
          {state.data.map((report) => (
            <article key={report.id}>
              <Image
                src={report.imageUrl}
                width={720}
                height={520}
                sizes="(max-width: 680px) 90vw, (max-width: 1080px) 44vw, 23vw"
                alt={report.imageAlt}
                unoptimized
              />
              <div>
                <span className="cc-report-species">{report.species}</span>
                <strong>{report.measurement}</strong>
                <p>{report.siteName}</p>
                <p>
                  <time dateTime={report.createdAt}>
                    {formatTimestamp(report.createdAt)}
                  </time>{" "}
                  · @{report.handle}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CommunitySection({ state }: { state: DataState<CommunityResult> }) {
  return (
    <section
      className="cc-community-preview"
      aria-labelledby="cc-community-title"
    >
      <header>
        <div>
          <h2 id="cc-community-title">
            Local threads,
            <br />
            before you make the drive.
          </h2>
          <p>
            Read recent public-place notes from anglers nearby. Exact private
            locations stay private.
          </p>
        </div>
        <Link href="/community">
          View all reports <ArrowIcon />
        </Link>
      </header>
      {state.status === "loading" && (
        <div className="cc-community-state" aria-live="polite">
          <span className="cc-data-spinner" aria-hidden="true" />
          <p>Looking for nearby public threads…</p>
        </div>
      )}
      {state.status === "error" && (
        <div className="cc-community-state" role="status">
          <strong>Community threads are temporarily unavailable.</strong>
          <p>{state.message}</p>
        </div>
      )}
      {state.status === "empty" && (
        <div className="cc-community-state" role="status">
          <strong>No public threads to show yet.</strong>
          <p>
            When reviewed local conversations are available, the newest ones
            will appear here.
          </p>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <p className="cc-community-scope">
            {state.data.scope === "local"
              ? `Showing threads near ${state.data.siteName ?? "you"}`
              : "Showing the newest public threads across CastingCompass"}
          </p>
          <div className="cc-thread-grid">
            {state.data.threads.map((thread) => (
              <article key={thread.id}>
                <div>
                  <span>{thread.siteName}</span>
                  <time dateTime={thread.createdAt}>
                    {formatTimestamp(thread.createdAt)}
                  </time>
                </div>
                <h3>{thread.title}</h3>
                <p>{thread.body}</p>
                <footer>
                  @{thread.handle} · {thread.commentCount} comments
                </footer>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function TestFlightSection() {
  return (
    <section className="cc-testflight" aria-labelledby="cc-testflight-title">
      <div>
        <h2 id="cc-testflight-title">
          Carry the coast
          <br />
          with you.
        </h2>
        <p>
          Keep a California halibut plan, current conditions, and public-place
          context close at hand. The iPhone preview is a visual mockup while the
          mobile build is still in development.
        </p>
        <button
          className="cc-testflight-button"
          type="button"
          aria-disabled="true"
        >
          <span>Download on TestFlight</span>
          <strong>Coming soon</strong>
        </button>
      </div>
      <figure>
        <Image
          src="/marketing/daylight-draft/testflight-phone-mockup-v1.png"
          width={1536}
          height={1024}
          sizes="(max-width: 800px) 92vw, 52vw"
          alt="Concept mockup of CastingCompass on a phone held in one hand"
          unoptimized
        />
        <figcaption>Concept preview—not a released app screen.</figcaption>
      </figure>
    </section>
  );
}

function MailingList() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || status === "loading") return;
    setStatus("loading");
    setMessage("");
    try {
      const responseMessage = await joinMarketingMailingList(email.trim());
      setStatus("success");
      setMessage(responseMessage);
      setEmail("");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Signup is temporarily unavailable.",
      );
    }
  }

  return (
    <section className="cc-mailing-list" aria-labelledby="cc-mailing-title">
      <div>
        <h2 id="cc-mailing-title">Join the coast list.</h2>
        <p>
          Occasional product updates, public-place notes, and planning tips. No
          catch promises.
        </p>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="cc-mailing-email">Email address</label>
        <div>
          <input
            id="cc-mailing-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            required
            disabled={status === "loading"}
          />
          <button type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Joining…" : "Join mail list"}
          </button>
        </div>
        {message && (
          <p
            className={`cc-mailing-message cc-mailing-message-${status}`}
            role="status"
          >
            {message}
          </p>
        )}
      </form>
    </section>
  );
}

export function MarketingHome() {
  const [introState, setIntroState] = useState<IntroState>("drawing");
  const [location, setLocation] = useState<LocationState>({
    status: "loading",
  });
  const [opportunity, setOpportunity] = useState<
    DataState<MarketingOpportunity>
  >({ status: "loading" });
  const [community, setCommunity] = useState<DataState<CommunityResult>>({
    status: "loading",
  });
  const [reports, setReports] = useState<DataState<MarketingCatchReport[]>>({
    status: "loading",
  });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [approachActive, setApproachActive] = useState(false);
  const approachRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      const frame = window.requestAnimationFrame(() =>
        setIntroState("settled"),
      );
      return () => window.cancelAnimationFrame(frame);
    }

    const revealTimer = window.setTimeout(
      () => setIntroState("revealing"),
      INTRO_REVEAL_DELAY_MS,
    );
    // Animation completion normally settles the intro. This is only a safety
    // fallback for environments that suppress CSS animation events.
    const finishTimer = window.setTimeout(
      () => setIntroState("settled"),
      INTRO_FALLBACK_SETTLE_MS,
    );
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(finishTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void requestBrowserLocation().then((nextLocation) => {
      if (active) setLocation(nextLocation);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Keep the large offline opportunity projection out of the critical intro
    // path. Geolocation still resolves first; data hydration begins as soon as
    // the three-second reveal has handed control to the page.
    if (location.status === "loading" || introState !== "settled") return;
    const controller = new AbortController();

    void loadMarketingOpportunity(location, controller.signal)
      .then((data) => setOpportunity({ status: "ready", data }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setOpportunity({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Current conditions are unavailable.",
          });
        }
      });

    void loadMarketingCommunity(location, controller.signal)
      .then((data) =>
        setCommunity(
          data.threads.length
            ? { status: "ready", data }
            : {
                status: "empty",
                message: "No public threads are available yet.",
              },
        ),
      )
      .catch((error) => {
        if (!controller.signal.aborted) {
          setCommunity({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Public threads are unavailable.",
          });
        }
      });

    return () => controller.abort();
  }, [introState, location]);

  useEffect(() => {
    const controller = new AbortController();
    void loadApprovedCatchReports(controller.signal)
      .then((data) =>
        setReports(
          data.length
            ? { status: "ready", data }
            : { status: "empty", message: "No approved catch photos yet." },
        ),
      )
      .catch((error) => {
        if (!controller.signal.aborted) {
          setReports({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Approved catch reports are unavailable.",
          });
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let scheduled = false;
    const update = () => {
      scheduled = false;
      setShowBackToTop(window.scrollY > window.innerHeight);
    };
    const onScroll = () => {
      if (!scheduled) {
        scheduled = true;
        window.requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    const node = approachRef.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() => setApproachActive(true));
      return () => window.cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setApproachActive(true);
      },
      { threshold: 0.22 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function returnToTop() {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }

  return (
    <main
      className={`marketing-home cc-landing cc-intro-${introState}`}
      aria-busy={introState !== "settled"}
    >
      <a className="skip-link cc-skip-link" href="#cc-approach">
        Skip to landing page content
      </a>

      <section className="cc-opening" aria-labelledby="cc-title">
        <div className="cc-opening-sticky">
          <div className="cc-hero-topo-panel">
            <HeroTopographicArt />
            <ForecastCard state={opportunity} location={location} />
          </div>

          <Header />

          <div className="cc-hero-copy">
            <h1 id="cc-title">
              Give every
              <br />
              cast a compass.
            </h1>
            <p className="cc-hero-description">
              Pick your target, compare public shore and pier windows, and see
              which conditions line up before you make the drive.
            </p>
            <div className="cc-hero-actions">
              <Link className="cc-primary-button" href="/forecast">
                Find best spot near you <ArrowIcon />
              </Link>
              <Link className="cc-secondary-button" href="#cc-approach">
                See how it works
              </Link>
            </div>
            <p className="cc-utility-copy">
              <span aria-hidden="true">✓</span> No login required to explore
            </p>
          </div>
        </div>
      </section>

      {introState !== "settled" && (
        <TopographicLoader onRevealComplete={() => setIntroState("settled")} />
      )}

      <section
        ref={approachRef}
        className={`cc-approach${approachActive ? " cc-approach-active" : ""}`}
        id="cc-approach"
        aria-labelledby="cc-approach-title"
      >
        <div className="cc-approach-sticky">
          <Image
            className="cc-approach-background"
            src="/marketing/daylight-draft/surf-cast-wide.jpg"
            alt="An angler casting from the surf"
            fill
            sizes="100vw"
            unoptimized
          />
          <div className="cc-approach-shade" />
          <div className="cc-approach-copy">
            <h2 id="cc-approach-title">
              Read the coast
              <br />
              before you cast.
            </h2>
            <p>
              CastingCompass brings the useful pieces of a fishing plan into one
              place—without pretending conditions can guarantee a catch.
            </p>
          </div>
          <div className="cc-white-layer" aria-hidden="true">
            <div className="cc-white-layer-left" />
            <div className="cc-white-layer-right" />
          </div>
        </div>
      </section>

      <section
        className="cc-approach-grid cc-modern-mosaic"
        aria-labelledby="cc-mosaic-title"
      >
        <div className="cc-mosaic-rules" aria-hidden="true" />

        <header className="cc-mosaic-intro">
          <h2 id="cc-mosaic-title">Every piece adds context.</h2>
          <p>
            Compare public places, current conditions, one target species, and
            local reports while keeping the coast itself in view.
          </p>
        </header>

        <figure className="cc-mosaic-image cc-mosaic-image-hero">
          <Image
            src="/marketing/daylight-draft/bay-bridge-angler.jpg"
            alt="An angler fishing along the San Francisco Bay waterfront"
            fill
            sizes="(max-width: 800px) 100vw, 34vw"
            unoptimized
          />
        </figure>

        <figure className="cc-mosaic-image cc-mosaic-image-tide">
          <Image
            src="/marketing/daylight-draft/surf-cast-close.jpg"
            alt="A close view of surf breaking around an angler"
            fill
            sizes="(max-width: 800px) 48vw, 25vw"
            unoptimized
          />
        </figure>

        <figure className="cc-mosaic-image cc-mosaic-image-main">
          <Image
            src="/marketing/daylight-draft/surf-cast-wide.jpg"
            alt="A wide coastal view of an angler casting through the surf"
            fill
            sizes="(max-width: 800px) 100vw, 46vw"
            unoptimized
          />
        </figure>

        <figure className="cc-mosaic-image cc-mosaic-image-pier" aria-hidden="true">
          <Image
            src="/marketing/daylight-draft/bay-bridge-angler.jpg"
            alt=""
            fill
            sizes="(max-width: 800px) 48vw, 25vw"
            unoptimized
          />
        </figure>

        <figure className="cc-mosaic-image cc-mosaic-image-gear" aria-hidden="true">
          <Image
            src="/marketing/daylight-draft/surf-cast-close.jpg"
            alt=""
            fill
            sizes="(max-width: 800px) 48vw, 25vw"
            unoptimized
          />
        </figure>

        <figure className="cc-mosaic-image cc-mosaic-image-community" aria-hidden="true">
          <Image
            src="/marketing/daylight-draft/bay-bridge-angler.jpg"
            alt=""
            fill
            sizes="(max-width: 800px) 48vw, 25vw"
            unoptimized
          />
        </figure>

        {approachCards.map((card) => (
          <article
            className={`cc-mosaic-card cc-mosaic-card-${card.number}`}
            key={card.number}
          >
            <span>{card.number}</span>
            <h3>{card.title}</h3>
            <p>{card.copy}</p>
          </article>
        ))}
      </section>

      <RecentReports state={reports} />
      <CommunitySection state={community} />
      <TestFlightSection />

      <section className="cc-final-cta" aria-labelledby="cc-final-title">
        <Image
          src="/marketing/daylight-draft/surf-cast-close.jpg"
          alt="An angler making a cast through the surf at golden hour"
          fill
          sizes="100vw"
          unoptimized
        />
        <div className="cc-final-wash" />
        <div>
          <h2 id="cc-final-title">
            Start with the conditions.
            <br />
            Choose the coast from there.
          </h2>
        </div>
      </section>

      <MailingList />

      <footer className="cc-footer">
        <div className="cc-footer-brand">
          <CompassLogo compact />
          <p>Relative planning guidance, not a catch prediction.</p>
        </div>
        <nav aria-label="Product links">
          <strong>Product</strong>
          <Link href="/forecast">Forecast</Link>
          <Link href="/community">Community</Link>
          <Link href="/ai-disclosure">How it works</Link>
        </nav>
        <nav aria-label="Company links">
          <strong>Company</strong>
          <Link href="/ai-disclosure">About CastingCompass</Link>
          <a href="mailto:support@castingcompass.com">Support</a>
        </nav>
        <nav aria-label="Legal links">
          <strong>Legal</strong>
          <Link href="/terms">Terms of service</Link>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/ai-disclosure">AI disclosure</Link>
        </nav>
        <p className="cc-footer-copyright">
          © 2026 CastingCompass. All rights reserved.
        </p>
      </footer>

      {showBackToTop && (
        <button
          className="cc-back-to-top"
          type="button"
          onClick={returnToTop}
          aria-label="Back to top"
        >
          <span aria-hidden="true">↑</span>
        </button>
      )}
    </main>
  );
}
