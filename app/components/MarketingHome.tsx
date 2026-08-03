"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  joinMarketingMailingList,
  loadApprovedCatchReports,
  loadMarketingCommunity,
  loadMarketingOpportunity,
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

const daylightStoryBeats = [
  {
    number: "01",
    eyebrow: "01 / ORIENT",
    title: ["Read the coast", "before you cast."],
    copy: "Start with a real place and the conditions that shape a useful fishing window.",
    image: {
      src: "/marketing/daylight-draft/personal-rod-pov.jpg",
      alt: "A fishing rod held over the water from a rocky jetty",
    },
    imageSide: "right",
  },
  {
    number: "02",
    eyebrow: "02 / FIND THE WINDOW",
    title: ["Follow the water", "to the right spot."],
    copy: "Compare public places, target one species, and make the drive feel considered.",
    image: {
      src: "/marketing/daylight-draft/personal-angler-catch.jpg",
      alt: "An angler holding a fish and rod beside the Santa Barbara coast",
    },
    imageSide: "left",
  },
  {
    number: "03",
    eyebrow: "03 / LOG THE CONTEXT",
    title: ["Every piece adds", "context."],
    copy: "Log the place, conditions, and result so the next plan starts with better local context.",
    image: {
      src: "/marketing/daylight-draft/personal-santa-barbara-sunset.jpg",
      alt: "A wide sunset over the Santa Barbara coast",
    },
    imageSide: "right",
  },
] as const;

const DEFAULT_MARKETING_LOCATION: LocationState = {
  status: "available",
  latitude: 34.4208,
  longitude: -119.6982,
};

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

function SocialPlaceholder({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span
      className="cc-social-placeholder"
      role="img"
      aria-label={`${label} profile not yet available`}
      title={`${label} profile not yet available`}
    >
      <Icon size={17}>{children}</Icon>
    </span>
  );
}

function AnimatedHeroLine({ text, startIndex }: { text: string; startIndex: number }) {
  let letterIndex = startIndex;
  const words = text.split(" ");
  return (
    <span className="cc-hero-line" aria-hidden="true">
      {words.map((word, wordIndex) => {
        const letters = Array.from(word).map((letter) => {
          const currentIndex = letterIndex;
          letterIndex += 1;
          return (
            <span
              className="cc-hero-letter"
              key={`${text}-${currentIndex}`}
              style={{ "--cc-hero-letter-delay": `${currentIndex * 42}ms` } as CSSProperties}
            >
              {letter}
            </span>
          );
        });

        return (
          <Fragment key={`${text}-${word}-${wordIndex}`}>
            <span className="cc-hero-word">{letters}</span>
            {wordIndex < words.length - 1 && (
              <span className="cc-hero-space" aria-hidden="true">{"\u00a0"}</span>
            )}
          </Fragment>
        );
      })}
    </span>
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
      ? "Santa Barbara scope"
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
          <strong>Community Images Will Appear When Available</strong>
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
  const [location] = useState<LocationState>(DEFAULT_MARKETING_LOCATION);
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
    // Keep the large offline opportunity projection out of the critical intro
    // path. The default Santa Barbara scope hydrates after the reveal.
    if (introState !== "settled") return;
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
            : {
                status: "empty",
                message: "Community Images Will Appear When Available",
              },
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

  useLayoutEffect(() => {
    const section = approachRef.current;
    const list = section?.querySelector<HTMLElement>(".cc-usp-list");
    if (!section || !list) return;

    const contents = Array.from(
      section.querySelectorAll<HTMLElement>(".cc-usp-content"),
    );
    const items = Array.from(
      section.querySelectorAll<HTMLElement>(".cc-usp-item"),
    );
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let cleanupMode = () => {};
    let frame = 0;
    let masterProgress = Number(section.dataset.scrollProgress ?? 0);

    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const easeOut = (value: number) => {
      const eased = clamp(value);
      return 1 - (1 - eased) ** 3;
    };
    const lerp = (from: number, to: number, progress: number) =>
      from + (to - from) * clamp(progress);
    const setAutoAlpha = (element: HTMLElement, value: number) => {
      const alpha = clamp(value);
      element.style.opacity = alpha.toFixed(4);
      element.style.visibility = alpha > 0.01 ? "visible" : "hidden";
      element.style.pointerEvents = "none";
      element.dataset.autoAlpha = alpha.toFixed(4);
    };
    const resetInlineAnimationState = () => {
      contents.forEach((content) => {
        content.style.removeProperty("opacity");
        content.style.removeProperty("visibility");
        content.style.removeProperty("pointer-events");
        content.style.removeProperty("position");
        content.style.removeProperty("inset");
        content.style.removeProperty("transform");
        content.style.removeProperty("--cc-usp-content-y");
        content.dataset.autoAlpha = "0";
        content.dataset.visibilityState = "hidden";
        content
          .querySelectorAll<HTMLElement>("[data-usp-line]")
          .forEach((line) => {
            line.style.removeProperty("--cc-usp-line-y");
            line.style.removeProperty("--cc-usp-line-alpha");
          });
      });
      items.forEach((item) => item.classList.remove("cc-usp-item-is-visible"));
    };
    const getScrollProgress = () => {
      const rect = list.getBoundingClientRect();
      const start = window.innerHeight * 0.52;
      const end = window.innerHeight * 0.5;
      return clamp((start - rect.top) / Math.max(start + list.offsetHeight - end, 1));
    };

    const configureDesktop = (reducedMotion: boolean) => {
      if (reducedMotion) {
        contents.forEach((content) => {
          content.style.position = "static";
          content.style.inset = "auto";
          content.style.transform = "none";
          setAutoAlpha(content, 1);
          content.dataset.visibilityState = "visible";
        });
        section.dataset.animationMode = "desktop-reduced";
        section.dataset.visibleStories = "3";
        return () => resetInlineAnimationState();
      }

      // One normalized master timeline, equivalent to Daylight's paused GSAP
      // timeline, owns every desktop story state and is driven by native scroll.
      const storyOpacity = (
        progress: number,
        enterStart: number,
        enterEnd: number,
        holdEnd: number,
        exitEnd: number,
      ) => {
        if (progress <= enterStart || progress >= exitEnd) return 0;
        if (progress < enterEnd) {
          return easeOut((progress - enterStart) / (enterEnd - enterStart));
        }
        if (progress <= holdEnd) return 1;
        return 1 - easeOut((progress - holdEnd) / (exitEnd - holdEnd));
      };
      const masterTimeline = {
        progress(value?: number) {
          if (value === undefined) return masterProgress;
          masterProgress = clamp(value);

          const states = [
            {
              opacity: storyOpacity(masterProgress, 0.06, 0.19, 0.28, 0.41),
              y: lerp(150, -50, masterProgress / 0.4),
              enter: 0.06,
            },
            {
              opacity: storyOpacity(masterProgress, 0.44, 0.56, 0.58, 0.70),
              y: lerp(50, -150, (masterProgress - 0.3) / 0.4),
              enter: 0.44,
            },
            {
              opacity: storyOpacity(masterProgress, 0.73, 0.86, 1, 1.1),
              y: lerp(-50, -250, (masterProgress - 0.6) / 0.4),
              enter: 0.73,
            },
          ];
          const maxOpacity = Math.max(...states.map((state) => state.opacity));
          const activeIndex = states.findIndex(
            (state) => state.opacity === maxOpacity && maxOpacity > 0.01,
          );

          contents.forEach((content, index) => {
            const state = states[index];
            const opacity = index === activeIndex ? state.opacity : 0;
            const lineProgress = easeOut(
              (masterProgress - state.enter) / 0.15,
            );
            setAutoAlpha(content, opacity);
            content.style.setProperty(
              "--cc-usp-content-y",
              `${Math.round(state.y)}px`,
            );
            content.dataset.visibilityState = opacity > 0.01 ? "visible" : "hidden";
            content
              .querySelectorAll<HTMLElement>("[data-usp-line]")
              .forEach((line) => {
                const isEyebrow = line.dataset.uspLine === "eyebrow";
                line.style.setProperty(
                  "--cc-usp-line-y",
                  `${Math.round((isEyebrow ? 100 : 60) * (1 - lineProgress))}%`,
                );
                line.style.setProperty(
                  "--cc-usp-line-alpha",
                  isEyebrow ? "1" : lineProgress.toFixed(4),
                );
              });
          });

          section.dataset.animationMode = "desktop-master";
          section.dataset.story = activeIndex < 0 ? "0" : String(activeIndex + 1);
          section.dataset.visibleStories = activeIndex < 0 ? "0" : "1";
          section.dataset.scrollProgress = masterProgress.toFixed(3);
        },
        kill() {
          window.removeEventListener("scroll", scheduleUpdate);
          window.removeEventListener("resize", scheduleUpdate);
          if (frame) window.cancelAnimationFrame(frame);
          frame = 0;
        },
      };
      const update = () => masterTimeline.progress(getScrollProgress());
      const scheduleUpdate = () => {
        if (!frame) frame = window.requestAnimationFrame(() => {
          frame = 0;
          update();
        });
      };

      masterTimeline.progress(
        Number.isFinite(masterProgress) ? masterProgress : getScrollProgress(),
      );
      window.addEventListener("scroll", scheduleUpdate, { passive: true });
      window.addEventListener("resize", scheduleUpdate);

      return () => {
        masterTimeline.kill();
        resetInlineAnimationState();
      };
    };

    const configureMobile = () => {
      contents.forEach((content) => {
        content.style.position = "static";
        content.style.inset = "auto";
        content.style.transform = "none";
        setAutoAlpha(content, 1);
        content.dataset.visibilityState = "visible";
      });
      section.dataset.animationMode = "mobile-flow";
      section.dataset.story = "0";
      section.dataset.visibleStories = "3";
      const observer =
        typeof IntersectionObserver === "function"
          ? new IntersectionObserver(
              (entries) => {
                entries.forEach((entry) => {
                  if (entry.isIntersecting) {
                    entry.target.classList.add("cc-usp-item-is-visible");
                    observer?.unobserve(entry.target);
                  }
                });
              },
              { threshold: 0.2, rootMargin: "0px 0px -10% 0px" },
            )
          : null;
      items.forEach((item) => {
        if (observer) observer.observe(item);
        else item.classList.add("cc-usp-item-is-visible");
      });
      return () => {
        observer?.disconnect();
        resetInlineAnimationState();
      };
    };

    const configure = () => {
      cleanupMode();
      cleanupMode = desktopQuery.matches
        ? configureDesktop(reducedMotionQuery.matches)
        : configureMobile();
    };
    const onMediaChange = () => configure();

    resetInlineAnimationState();
    configure();
    desktopQuery.addEventListener("change", onMediaChange);
    reducedMotionQuery.addEventListener("change", onMediaChange);

    return () => {
      cleanupMode();
      desktopQuery.removeEventListener("change", onMediaChange);
      reducedMotionQuery.removeEventListener("change", onMediaChange);
      resetInlineAnimationState();
    };
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
            <h1 id="cc-title" aria-label="Give every cast a compass.">
              <AnimatedHeroLine text="Give every" startIndex={0} />
              <AnimatedHeroLine text="cast a compass." startIndex={10} />
            </h1>
            <p className="cc-hero-description">
              Choose a target species, compare public fishing locations, and
              find the most promising current window before you make the drive.
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

      <TestFlightSection />

      <section
        ref={approachRef}
        className="cc-approach cc-usp-section"
        id="cc-approach"
        aria-labelledby="cc-approach-title"
        data-scroll-linked="true"
      >
        <ul className="cc-usp-list">
          {daylightStoryBeats.map((story, storyIndex) => {
            const storyNumber = storyIndex + 1;
            const titleId =
              storyIndex === 0
                ? "cc-approach-title"
                : `cc-approach-title-${storyNumber}`;

            return (
              <li
                className={`cc-usp-item cc-usp-item-${storyNumber}`}
                data-story-row={storyNumber}
                key={story.eyebrow}
              >
                <div className="cc-usp-center-cell">
                  <div
                    className={`cc-usp-content cc-usp-content-${storyIndex}`}
                    data-story-content={storyNumber}
                  >
                    <span className="cc-usp-eyebrow-mask">
                      <span className="cc-usp-eyebrow" data-usp-line="eyebrow">
                        {story.eyebrow}
                      </span>
                    </span>
                    <h2 id={titleId} className="cc-usp-headline">
                      {story.title.map((line) => (
                        <span className="cc-usp-title-line-mask" key={line}>
                          <span className="cc-usp-title-line" data-usp-line="headline">
                            {line}
                          </span>
                        </span>
                      ))}
                    </h2>
                    <p>{story.copy}</p>
                  </div>
                </div>
                <figure
                  className={`cc-usp-figure cc-usp-figure-${story.imageSide}`}
                  data-image-frame={storyNumber}
                >
                  <div className="cc-usp-media-frame">
                    <Image
                      src={story.image.src}
                      alt={story.image.alt}
                      fill
                      sizes="(max-width: 1023px) 78vw, 25vw"
                      unoptimized
                    />
                  </div>
                </figure>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="cc-approach-grid cc-modern-mosaic"
        aria-labelledby="cc-mosaic-title"
      >
        <div className="cc-mosaic-rules" aria-hidden="true" />

        <header className="cc-mosaic-intro">
          <h2 id="cc-mosaic-title">Keep a better log.</h2>
          <p>
            Log a trip to help CastingCompass improve its guidance with real
            outcomes and give nearby anglers more useful local knowledge for
            their next plan.
          </p>
        </header>

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

        <figure className="cc-mosaic-image cc-mosaic-image-hero">
          <Image
            src="/structure-guides/eelgrass.jpg"
            alt="Eelgrass growing along a shallow coastal channel"
            fill
            sizes="(max-width: 800px) 100vw, 34vw"
            unoptimized
          />
        </figure>

        <figure className="cc-mosaic-image cc-mosaic-image-tide">
          <Image
            src="/structure-guides/estuary.jpg"
            alt="A coastal estuary where water and shoreline meet"
            fill
            sizes="(max-width: 800px) 48vw, 25vw"
            unoptimized
          />
        </figure>

        <figure className="cc-mosaic-image cc-mosaic-image-main">
          <Image
            src="/structure-guides/pilings.jpg"
            alt="Wooden pilings standing in coastal water"
            fill
            sizes="(max-width: 800px) 100vw, 46vw"
            unoptimized
          />
        </figure>

        <figure className="cc-mosaic-image cc-mosaic-image-pier" aria-hidden="true">
          <Image
            src="/structure-guides/riprap.jpg"
            alt=""
            fill
            sizes="(max-width: 800px) 48vw, 25vw"
            unoptimized
          />
        </figure>

        <figure className="cc-mosaic-image cc-mosaic-image-gear" aria-hidden="true">
          <Image
            src="/structure-guides/sandbar.jpg"
            alt=""
            fill
            sizes="(max-width: 800px) 48vw, 25vw"
            unoptimized
          />
        </figure>

        <figure className="cc-mosaic-image cc-mosaic-image-community">
          <Image
            src="/structure-guides/tidal-channel.jpg"
            alt="A tidal channel cutting through a coastal sandbar"
            fill
            sizes="(max-width: 800px) 48vw, 25vw"
            unoptimized
          />
        </figure>

      </section>

      <RecentReports state={reports} />
      <CommunitySection state={community} />

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
          <div
            className="cc-footer-social"
            role="group"
            aria-label="Social profiles"
          >
            <SocialPlaceholder label="Instagram">
              <rect x="4" y="4" width="16" height="16" rx="4" />
              <circle cx="12" cy="12" r="3.5" />
              <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
            </SocialPlaceholder>
            <SocialPlaceholder label="Facebook">
              <path d="M14.5 5.5h-2.2c-1.8 0-2.8 1.1-2.8 3v2.1H7.2v3h2.3v5.2h3.3v-5.2h2.6l.5-3h-3.1V9c0-.6.3-.9 1-.9h.7Z" />
            </SocialPlaceholder>
            <SocialPlaceholder label="YouTube">
              <rect x="3" y="6" width="18" height="12" rx="3" />
              <path d="m10 9 5 3-5 3Z" />
            </SocialPlaceholder>
            <SocialPlaceholder label="X">
              <path d="M5 5l14 14M19 5 5 19" />
            </SocialPlaceholder>
          </div>
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
          <a href="mailto:support@castingcompass.com">
            support@castingcompass.com
          </a>
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
