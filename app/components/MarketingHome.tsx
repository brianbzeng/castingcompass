"use client";

import Image from "next/image";
import Link from "next/link";
import Lenis from "lenis";
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

const logCards = [
  {
    number: "01",
    title: "Record every outcome",
    copy: "Keep catches, short releases, other species, and no-catch time in the same honest record.",
  },
  {
    number: "02",
    title: "Reuse your setup",
    copy: "Save rod, reel, rig, and bait or lure as a gear preset for the next trip.",
  },
  {
    number: "03",
    title: "Note what changed",
    copy: "Capture waves, weeds, snags, casting room, and overall fishability at the water.",
  },
  {
    number: "04",
    title: "Keep details private",
    copy: "Raw trip notes and verification photos stay private, with photo metadata stripped before storage.",
  },
] as const;

const daylightStoryBeats = [
  {
    number: "01",
    eyebrow: "01 / COMPARE",
    title: ["See what moves", "a spot up", "the list."],
    copy: "See how tide, wind, swell, source freshness, and one target species shape each relative opportunity score.",
    image: {
      src: "/marketing/daylight-draft/personal-rocky-intertidal.jpg",
      alt: "Two anglers fishing from rocks along a turbulent coast.",
      aspect: "landscape",
    },
    imageSide: "left",
    testFlight: false,
    disclosure: null,
  },
  {
    number: "02",
    eyebrow: "02 / LEARN",
    title: ["Every trip", "tells you", "something."],
    copy: "A keeper, a short release, or a no-catch trip can all make the next decision more informed.",
    image: {
      src: "/marketing/daylight-draft/personal-angler-catch.jpg",
      alt: "A freshly caught fish being measured on a pier.",
      aspect: "portrait",
    },
    imageSide: "right",
    testFlight: false,
    disclosure: null,
  },
  {
    number: "03",
    eyebrow: "03 / KEEP",
    title: ["Save what", "worked for", "next time."],
    copy: "Keep public places, gear presets, and trip history together, ready for the next window.",
    image: {
      src: "/marketing/daylight-draft/testflight-phone-mockup-v1.png",
      alt: "A phone held in two hands beside the water.",
      aspect: "landscape",
    },
    imageSide: "left",
    testFlight: true,
    disclosure: "Watermarked stock preview used for layout testing.",
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
const USP_SETTLE_CAPTURE_VH = 0.65;
const USP_SETTLE_INPUT_END_MS = 140;
const USP_SETTLE_DURATION_SECONDS = 0.55;
const USP_TEXT_VELOCITY_LERP = 0.16;
const USP_TEXT_OFFSET_LERP = 0.14;
const USP_VELOCITY_PARALLAX_FACTOR = 0.5;
const USP_VELOCITY_PARALLAX_MAX_PX = 12;

type UspScrollDirection = -1 | 0 | 1;

type UspSettleCandidate = {
  distance: number;
  story: number;
  target: number;
};

export function selectDirectionalSettleCandidate(
  targets: readonly number[],
  releaseY: number,
  direction: UspScrollDirection,
  forwardCaptureDistance: number,
): UspSettleCandidate | null {
  if (direction === 0) return null;

  const orderedIndexes =
    direction > 0
      ? targets.map((_, index) => index)
      : targets.map((_, index) => index).reverse();

  for (const index of orderedIndexes) {
    const target = targets[index];
    const distance = direction > 0 ? target - releaseY : releaseY - target;
    if (distance < 0) continue;
    if (distance > forwardCaptureDistance) return null;
    return { distance, story: index + 1, target };
  }

  return null;
}

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

function AnimatedHeroLine({
  text,
  startIndex,
}: {
  text: string;
  startIndex: number;
}) {
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
              style={
                {
                  "--cc-hero-letter-delay": `${currentIndex * 42}ms`,
                } as CSSProperties
              }
            >
              {letter}
            </span>
          );
        });

        return (
          <Fragment key={`${text}-${word}-${wordIndex}`}>
            <span className="cc-hero-word">{letters}</span>
            {wordIndex < words.length - 1 && (
              <span className="cc-hero-space" aria-hidden="true">
                {"\u00a0"}
              </span>
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
            Talk about the water,
            <br />
            not the exact spot.
          </h2>
          <p>
            Read human-reviewed notes on public access, presentation,
            structure, and broad conditions. Private locations stay private.
          </p>
        </div>
        <Link href="/community">
          Open community <ArrowIcon />
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

type DaylightStory = (typeof daylightStoryBeats)[number];

function UspStoryContent({
  story,
  storyIndex,
}: {
  story: DaylightStory;
  storyIndex: number;
}) {
  const storyNumber = storyIndex + 1;
  const titleId =
    storyIndex === 0 ? "cc-approach-title" : `cc-approach-title-${storyNumber}`;

  return (
    <div
      className={`cc-usp-content cc-usp-content-${storyIndex}`}
      data-story-content={storyNumber}
    >
      <div className="cc-usp-content-inner">
        <span className="cc-usp-eyebrow-mask">
          <span className="cc-usp-eyebrow" data-usp-line="eyebrow">
            {story.eyebrow}
          </span>
        </span>
        <h2 id={titleId} className="cc-usp-headline">
          {story.title.map((line, lineIndex) => (
            <Fragment key={line}>
              <span className="cc-usp-title-line-mask">
                <span className="cc-usp-title-line" data-usp-line="headline">
                  {line}
                </span>
              </span>
              {lineIndex < story.title.length - 1 ? " " : null}
            </Fragment>
          ))}
        </h2>
        <p>{story.copy}</p>
        {story.testFlight && (
          <div className="cc-usp-testflight-action">
            <button
              className="cc-testflight-button"
              type="button"
              aria-disabled="true"
              aria-describedby="cc-usp-mockup-disclosure"
            >
              <span>Download on TestFlight</span>
              <strong>Coming soon</strong>
            </button>
            <small
              className="cc-usp-mockup-disclosure"
              id="cc-usp-mockup-disclosure"
            >
              {story.disclosure}
            </small>
          </div>
        )}
      </div>
    </div>
  );
}

function UspImage({ story, sizes }: { story: DaylightStory; sizes: string }) {
  return (
    <Image
      src={story.image.src}
      alt={story.image.alt}
      data-usp-story-asset={story.number}
      fill
      sizes={sizes}
      unoptimized
    />
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
          Occasional build notes, TestFlight invitations, and new-coast
          coverage. No catch promises.
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
  const [desktopUspActive, setDesktopUspActive] = useState(true);
  const approachRef = useRef<HTMLElement>(null);
  const imageChapterRef = useRef<HTMLElement>(null);

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
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const updateMode = () => {
      setDesktopUspActive(desktopQuery.matches && !reducedMotionQuery.matches);
    };

    updateMode();
    desktopQuery.addEventListener("change", updateMode);
    reducedMotionQuery.addEventListener("change", updateMode);
    return () => {
      desktopQuery.removeEventListener("change", updateMode);
      reducedMotionQuery.removeEventListener("change", updateMode);
    };
  }, []);

  useEffect(() => {
    const section = approachRef.current;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    if (
      !section ||
      !desktopUspActive ||
      !desktopQuery.matches ||
      reducedMotionQuery.matches
    ) {
      document.documentElement.dataset.ccLenis = "inactive";
      section?.setAttribute("data-usp-lenis", "inactive");
      return;
    }

    const lenis = new Lenis({
      lerp: 0.08,
      orientation: "vertical",
      gestureOrientation: "vertical",
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false,
      anchors: true,
      autoRaf: true,
    });
    const scrollWindow = window as typeof window & {
      __castingCompassLenis?: Lenis;
    };
    scrollWindow.__castingCompassLenis = lenis;
    document.documentElement.dataset.ccLenis = "active";
    section.dataset.uspLenis = "active";

    return () => {
      lenis.destroy();
      delete scrollWindow.__castingCompassLenis;
      delete document.documentElement.dataset.ccLenis;
      delete section.dataset.uspLenis;
    };
  }, [desktopUspActive]);

  useLayoutEffect(() => {
    const section = approachRef.current;
    if (!section) return;
    const imageChapter = imageChapterRef.current;

    const contents = Array.from(
      section.querySelectorAll<HTMLElement>(".cc-usp-content"),
    );
    const rows = Array.from(
      section.querySelectorAll<HTMLElement>("[data-usp-row]"),
    );
    const figures = Array.from(
      section.querySelectorAll<HTMLElement>("[data-usp-figure]"),
    );
    const images = figures.map((figure) =>
      figure.querySelector<HTMLImageElement>("img"),
    );
    const chapterLines = imageChapter
      ? Array.from(
          imageChapter.querySelectorAll<HTMLElement>("[data-chapter-line]"),
        )
      : [];
    const scrollWindow = window as typeof window & {
      __castingCompassLenis?: Lenis;
    };
    let frame = 0;
    let releaseProbeFrame = 0;
    let settleTimer: number | null = null;
    let settleToken = 0;
    let settleInProgress = false;
    let inputSequence = 0;
    let lastDirection: UspScrollDirection = 0;
    let lastScrollY = window.scrollY;
    let previousAnimationScrollY = window.scrollY;
    let lastInputAt = 0;
    let burstStartedAt = 0;
    let burstSustained = false;
    let touchY: number | null = null;
    let scrollbarPointerActive = false;
    let latestSettleTargets: number[] = [];
    let smoothedVelocity = 0;
    const renderedTextOffsets = contents.map(() => 0);

    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const clampRange = (value: number, minimum: number, maximum: number) =>
      Math.min(maximum, Math.max(minimum, value));
    const lerp = (from: number, to: number, amount: number) =>
      from + (to - from) * amount;
    const signedDirection = (value: number): UspScrollDirection =>
      value > 0 ? 1 : value < 0 ? -1 : 0;
    const smoothstep = (value: number) => {
      const progress = clamp(value);
      return progress * progress * (3 - 2 * progress);
    };
    const boundaryOpacities = (boundaryY: number, viewportHeight: number) => {
      const viewportCenter = viewportHeight / 2;
      const rawDelta = boundaryY - viewportCenter;
      const delta = Math.abs(rawDelta) <= 1 ? 0 : rawDelta;
      const fullFadeDistance = viewportHeight * 0.18;
      const crossoverDistance = viewportHeight * 0.08;
      const transitionStartY = viewportCenter + fullFadeDistance;
      const transitionEndY = viewportCenter - fullFadeDistance;
      const boundaryProgress = clamp(
        (boundaryY - transitionStartY) /
          (transitionEndY - transitionStartY),
      );
      const outgoing =
        delta >= fullFadeDistance
          ? 1
          : delta >= 0
            ? 0.2 + 0.8 * smoothstep(delta / fullFadeDistance)
            : delta > -crossoverDistance
              ? 0.2 * smoothstep(1 + delta / crossoverDistance)
              : 0;
      const incoming =
        delta >= crossoverDistance
          ? 0
          : delta > 0
            ? 0.2 * smoothstep(1 - delta / crossoverDistance)
            : delta > -fullFadeDistance
              ? 0.2 + 0.8 * smoothstep(-delta / fullFadeDistance)
              : 1;
      return {
        boundaryProgress,
        incoming,
        outgoing,
        transitionWeight: 1 - clamp(Math.abs(delta) / fullFadeDistance),
      };
    };
    const setGalleryDirection = (direction: UspScrollDirection) => {
      section.dataset.galleryDirection =
        direction > 0 ? "down" : direction < 0 ? "up" : "idle";
    };
    const setGallerySettleState = (
      state: "idle" | "eligible" | "settling" | "cancelled",
      story = 0,
    ) => {
      section.dataset.gallerySettleState = state;
      section.dataset.gallerySettleStory = String(story);
    };
    const resetInlineAnimationState = () => {
      contents.forEach((content) => {
        content.style.removeProperty("opacity");
        content.style.removeProperty("pointer-events");
        content.style.removeProperty("clip-path");
        content.style.removeProperty("--cc-usp-content-y");
        delete content.dataset.rowProgress;
        delete content.dataset.storyOpacity;
        delete content.dataset.baseOpacity;
        delete content.dataset.boundaryOffset;
        delete content.dataset.geometryOffset;
        delete content.dataset.renderedOffset;
        delete content.dataset.velocityOffset;
        const action = content.querySelector<HTMLButtonElement>(
          ".cc-testflight-button",
        );
        action?.removeAttribute("tabindex");
      });
      images.forEach((image) => {
        image?.style.removeProperty("--cc-usp-image-y");
        image?.style.removeProperty("--cc-usp-velocity-y");
        if (image) {
          delete image.dataset.parallaxProgress;
          delete image.dataset.velocityOffset;
        }
      });
      chapterLines.forEach((line) => {
        line.style.removeProperty("opacity");
        line.style.removeProperty("transform");
      });
      if (imageChapter) delete imageChapter.dataset.chapterProgress;
      rows.forEach((row) => {
        delete row.dataset.boundaryProgress;
        delete row.dataset.boundaryY;
        delete row.dataset.rowProgress;
      });
    };

    if (!desktopUspActive) {
      resetInlineAnimationState();
      section.dataset.animationMode = "mobile-flow";
      section.dataset.uspModel = "document-flow";
      section.dataset.uspSettleState = "disabled";
      setGalleryDirection(0);
      setGallerySettleState("idle");
      return () => {
        resetInlineAnimationState();
      };
    }

    section.dataset.uspSettleCount = "0";
    section.dataset.uspSettleCancelCount = "0";
    section.dataset.uspSettleState = "idle";
    setGalleryDirection(0);
    setGallerySettleState("idle");

    const update = () => {
      const viewportHeight = window.innerHeight;
      const viewportCenter = viewportHeight / 2;
      const scrollY = window.scrollY;
      const rawVelocity = scrollY - previousAnimationScrollY;
      previousAnimationScrollY = scrollY;
      smoothedVelocity = lerp(
        smoothedVelocity,
        rawVelocity,
        USP_TEXT_VELOCITY_LERP,
      );
      if (Math.abs(rawVelocity) < 0.1) {
        smoothedVelocity = lerp(smoothedVelocity, 0, 0.2);
      }
      const textVelocityLimit = viewportHeight * 0.08;
      const clampedTextVelocity = clampRange(
        smoothedVelocity,
        -textVelocityLimit,
        textVelocityLimit,
      );
      const maxTextVelocityOffset = clampRange(
        viewportHeight * 0.035,
        18,
        36,
      );
      const textVelocityOffset =
        (clampedTextVelocity / textVelocityLimit) * maxTextVelocityOffset;
      const lenisVelocity =
        section.dataset.uspSettleState === "input"
          ? (scrollWindow.__castingCompassLenis?.velocity ?? 0)
          : 0;
      const velocityOffset = Math.max(
        -USP_VELOCITY_PARALLAX_MAX_PX,
        Math.min(
          USP_VELOCITY_PARALLAX_MAX_PX,
          lenisVelocity * USP_VELOCITY_PARALLAX_FACTOR,
        ),
      );
      const measurements = rows.map((row) => {
        const rect = row.getBoundingClientRect();
        const progress = clamp(
          (viewportHeight - rect.top) / (viewportHeight + rect.height),
        );
        const easedProgress = smoothstep(progress);
        return {
          clipBottom: clamp((viewportHeight - rect.bottom) / viewportHeight),
          clipTop: clamp(rect.top / viewportHeight),
          parallaxY: (easedProgress - 0.5) * rect.height * 0.198,
          progress,
          textY: 18 - easedProgress * 36,
          centerInside:
            rect.top <= viewportCenter && rect.bottom >= viewportCenter,
          settleTarget:
            scrollY + rect.top + rect.height / 2 - viewportCenter,
          boundaryY: rect.bottom,
        };
      });
      const handoffs = measurements
        .slice(0, -1)
        .map((measurement) =>
          boundaryOpacities(measurement.boundaryY, viewportHeight),
        );
      const opacities = [
        handoffs[0]?.outgoing ?? 1,
        Math.min(handoffs[0]?.incoming ?? 1, handoffs[1]?.outgoing ?? 1),
        handoffs[1]?.incoming ?? 1,
      ];
      const boundaryOffsets = measurements.map((_, index) => {
        const previousHandoff = handoffs[index - 1];
        const nextHandoff = handoffs[index];
        const incomingOffset = previousHandoff
          ? (1 - previousHandoff.boundaryProgress) * 34
          : 0;
        const outgoingOffset = nextHandoff
          ? -nextHandoff.boundaryProgress * 34
          : 0;
        return incomingOffset + outgoingOffset;
      });
      const velocityOffsets = measurements.map((_, index) => {
        const incomingWeight = handoffs[index - 1]?.transitionWeight ?? 0;
        const outgoingWeight = handoffs[index]?.transitionWeight ?? 0;
        return (
          Math.abs(textVelocityOffset) * (incomingWeight - outgoingWeight)
        );
      });

      latestSettleTargets = measurements.map((measurement) =>
        Math.max(0, measurement.settleTarget),
      );

      contents.forEach((content, index) => {
        const measurement = measurements[index];
        const opacity = opacities[index];
        const geometryOffset = measurement.textY;
        const boundaryOffset = boundaryOffsets[index];
        const velocityOffset = velocityOffsets[index];
        const targetOffset = geometryOffset + boundaryOffset + velocityOffset;
        renderedTextOffsets[index] = lerp(
          renderedTextOffsets[index],
          targetOffset,
          USP_TEXT_OFFSET_LERP,
        );
        content.style.opacity = opacity.toFixed(4);
        content.style.pointerEvents = "none";
        content.style.clipPath = `inset(${(
          measurement.clipTop * viewportHeight
        ).toFixed(2)}px 0 ${(
          measurement.clipBottom * viewportHeight
        ).toFixed(2)}px 0)`;
        content.style.setProperty(
          "--cc-usp-content-y",
          `${renderedTextOffsets[index].toFixed(2)}px`,
        );
        content.dataset.rowProgress = measurement.progress.toFixed(4);
        content.dataset.storyOpacity = opacity.toFixed(4);
        content.dataset.baseOpacity = opacity.toFixed(4);
        content.dataset.boundaryOffset = boundaryOffset.toFixed(2);
        content.dataset.geometryOffset = geometryOffset.toFixed(2);
        content.dataset.velocityOffset = velocityOffset.toFixed(2);
        rows[index].dataset.rowProgress = measurement.progress.toFixed(4);
        rows[index].dataset.boundaryY = measurement.boundaryY.toFixed(2);
        if (handoffs[index]) {
          rows[index].dataset.boundaryProgress =
            handoffs[index].boundaryProgress.toFixed(4);
        } else {
          delete rows[index].dataset.boundaryProgress;
        }
        const action = content.querySelector<HTMLButtonElement>(
          ".cc-testflight-button",
        );
        if (action) {
          action.tabIndex =
            measurement.centerInside && opacity > 0.2 ? 0 : -1;
        }
      });
      images.forEach((image, index) => {
        const measurement = measurements[index];
        image?.style.setProperty(
          "--cc-usp-image-y",
          `${measurement.parallaxY.toFixed(2)}px`,
        );
        image?.style.setProperty(
          "--cc-usp-velocity-y",
          `${velocityOffset.toFixed(2)}px`,
        );
        if (image) {
          image.dataset.parallaxProgress = measurement.progress.toFixed(4);
          image.dataset.velocityOffset = velocityOffset.toFixed(2);
        }
      });
      if (imageChapter) {
        const chapterRect = imageChapter.getBoundingClientRect();
        const chapterProgress = clamp(
          (viewportHeight - chapterRect.top) / (viewportHeight * 0.82),
        );
        const chapterTiming = [
          { start: 0.2, duration: 0.3 },
          { start: 0.34, duration: 0.38 },
          { start: 0.43, duration: 0.38 },
          { start: 0.58, duration: 0.28 },
          { start: 0.72, duration: 0.24 },
        ];

        chapterLines.forEach((line, index) => {
          const timing = chapterTiming[index] ?? chapterTiming.at(-1)!;
          const lineProgress = smoothstep(
            (chapterProgress - timing.start) / timing.duration,
          );
          line.style.opacity = lineProgress.toFixed(4);
          line.style.transform = `translate3d(0, ${(
            (1 - lineProgress) * 108
          ).toFixed(2)}%, 0)`;
        });
        imageChapter.dataset.chapterProgress = chapterProgress.toFixed(4);
      }

      section.dataset.animationMode = "desktop-daylight-flow";
      section.dataset.uspModel = "document-flow";
      section.dataset.uspSmoothedVelocity = smoothedVelocity.toFixed(3);
      let textMotionActive = Math.abs(smoothedVelocity) > 0.05;
      contents.forEach((content, index) => {
        const previousOffset = Number(content.dataset.renderedOffset ?? "0");
        const currentOffset = renderedTextOffsets[index];
        content.dataset.renderedOffset = currentOffset.toFixed(2);
        if (Math.abs(currentOffset - previousOffset) > 0.1) {
          textMotionActive = true;
        }
      });
      if (textMotionActive) {
        scheduleUpdate();
      }
    };
    const scheduleUpdate = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          update();
        });
      }
    };
    const clearSettleTimer = () => {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (releaseProbeFrame) {
        window.cancelAnimationFrame(releaseProbeFrame);
        releaseProbeFrame = 0;
      }
    };
    const cancelActiveSettle = () => {
      if (!settleInProgress) return false;
      settleToken += 1;
      settleInProgress = false;
      const lenis = scrollWindow.__castingCompassLenis;
      lenis?.scrollTo(lenis.animatedScroll, {
        immediate: true,
        force: true,
      });
      section.dataset.uspSettleState = "cancelled";
      setGallerySettleState("cancelled");
      section.dataset.uspSettleCancelCount = String(
        Number(section.dataset.uspSettleCancelCount ?? "0") + 1,
      );
      return true;
    };
    const settleFromRelease = (
      releaseY: number,
      direction: UspScrollDirection,
      targets: readonly number[],
      sequence: number,
    ) => {
      if (sequence !== inputSequence || direction === 0) return;
      if (burstSustained || lastDirection === 0) {
        section.dataset.uspSettleState = "idle";
        setGallerySettleState("idle");
        burstSustained = false;
        return;
      }

      const lenis = scrollWindow.__castingCompassLenis;
      if (!lenis) return;
      const threshold = window.innerHeight * USP_SETTLE_CAPTURE_VH;
      section.dataset.uspSettleThreshold = threshold.toFixed(2);
      const candidate = selectDirectionalSettleCandidate(
        targets,
        releaseY,
        direction,
        threshold,
      );
      if (!candidate || candidate.distance < 1) {
        section.dataset.uspSettleState = "idle";
        setGallerySettleState("idle");
        return;
      }

      section.dataset.uspSettleState = "eligible";
      section.dataset.uspSettleDirection = String(direction);
      section.dataset.uspSettleReleaseY = releaseY.toFixed(2);
      section.dataset.uspSettleTargetY = candidate.target.toFixed(2);
      section.dataset.uspSettleStory = String(candidate.story);
      setGallerySettleState("eligible", candidate.story);
      const token = ++settleToken;
      releaseProbeFrame = window.requestAnimationFrame(() => {
        releaseProbeFrame = 0;
        if (sequence !== inputSequence || token !== settleToken) return;
        settleInProgress = true;
        section.dataset.uspSettleState = "settling";
        setGallerySettleState("settling", candidate.story);
        section.dataset.uspSettleCount = String(
          Number(section.dataset.uspSettleCount ?? "0") + 1,
        );
        lenis.scrollTo(candidate.target, {
          duration: USP_SETTLE_DURATION_SECONDS,
          easing: (time) => 1 - (1 - time) ** 3,
          lock: false,
          force: false,
          userData: { source: "usp-directional-settle" },
          onComplete: () => {
            if (token !== settleToken) return;
            settleInProgress = false;
            section.dataset.uspSettleState = "settled";
            setGallerySettleState("idle");
          },
        });
      });
    };
    const probeForStableRelease = (
      sequence: number,
      direction: UspScrollDirection,
      targets: readonly number[],
      previousY: number,
      stableFrames: number,
    ) => {
      if (sequence !== inputSequence || scrollbarPointerActive) return;
      if (burstSustained) {
        section.dataset.uspSettleState = "idle";
        setGallerySettleState("idle");
        burstSustained = false;
        return;
      }
      const lenis = scrollWindow.__castingCompassLenis;
      if (!lenis) return;
      const releaseY = lenis.animatedScroll;
      const isStable =
        Math.abs(releaseY - previousY) <= 1.25 &&
        Math.abs(lenis.targetScroll - releaseY) <= 2;
      const nextStableFrames = isStable ? stableFrames + 1 : 0;
      if (nextStableFrames >= 2) {
        settleFromRelease(releaseY, direction, targets, sequence);
        return;
      }
      releaseProbeFrame = window.requestAnimationFrame(() =>
        probeForStableRelease(
          sequence,
          direction,
          targets,
          releaseY,
          nextStableFrames,
        ),
      );
    };
    const beginReleaseProbe = (
      sequence: number,
      direction: UspScrollDirection,
      targets: readonly number[],
    ) => {
      settleTimer = null;
      if (sequence !== inputSequence) return;
      const elapsed = performance.now() - lastInputAt;
      if (elapsed < USP_SETTLE_INPUT_END_MS) {
        settleTimer = window.setTimeout(
          () => beginReleaseProbe(sequence, direction, targets),
          USP_SETTLE_INPUT_END_MS - elapsed,
        );
        return;
      }
      const lenis = scrollWindow.__castingCompassLenis;
      if (!lenis) return;
      releaseProbeFrame = window.requestAnimationFrame(() =>
        probeForStableRelease(
          sequence,
          direction,
          targets,
          lenis.animatedScroll,
          0,
        ),
      );
    };
    const registerInput = (direction: UspScrollDirection) => {
      const now = performance.now();
      if (now - lastInputAt > 240) {
        burstStartedAt = now;
        burstSustained = false;
      }
      lastInputAt = now;
      if (now - burstStartedAt > 700) burstSustained = true;
      if (direction !== 0) lastDirection = direction;
      inputSequence += 1;
      const sequence = inputSequence;
      clearSettleTimer();
      const cancelledSettle = cancelActiveSettle();
      section.dataset.uspSettleState = "input";
      setGalleryDirection(lastDirection);
      if (!cancelledSettle) setGallerySettleState("idle");
      const frozenTargets = [...latestSettleTargets];
      settleTimer = window.setTimeout(
        () => beginReleaseProbe(sequence, lastDirection, frozenTargets),
        USP_SETTLE_INPUT_END_MS,
      );
    };
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const delta = scrollY - lastScrollY;
      if (!settleInProgress && Math.abs(delta) > 1) {
        lastDirection = signedDirection(delta);
        setGalleryDirection(lastDirection);
      }
      lastScrollY = scrollY;
      scheduleUpdate();
    };
    const handleWheel = (event: WheelEvent) => {
      registerInput(signedDirection(event.deltaY));
    };
    const handleTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? null;
      registerInput(0);
    };
    const handleTouchMove = (event: TouchEvent) => {
      const nextTouchY = event.touches[0]?.clientY;
      if (nextTouchY === undefined || touchY === null) return;
      registerInput(signedDirection(touchY - nextTouchY));
      touchY = nextTouchY;
    };
    const handleTouchEnd = () => {
      touchY = null;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const downwardKeys = ["ArrowDown", "PageDown", "End", " "];
      const upwardKeys = ["ArrowUp", "PageUp", "Home"];
      if (downwardKeys.includes(event.key)) registerInput(1);
      if (upwardKeys.includes(event.key)) registerInput(-1);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      const scrollbarEdge =
        scrollbarWidth > 0
          ? document.documentElement.clientWidth
          : window.innerWidth - 16;
      if (
        event.pointerType !== "mouse" ||
        event.clientX < scrollbarEdge
      ) {
        return;
      }
      scrollbarPointerActive = true;
      inputSequence += 1;
      clearSettleTimer();
      const cancelledSettle = cancelActiveSettle();
      section.dataset.uspSettleState = "input";
      if (!cancelledSettle) setGallerySettleState("idle");
    };
    const handlePointerUp = () => {
      if (!scrollbarPointerActive) return;
      scrollbarPointerActive = false;
      registerInput(lastDirection);
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);

    resetInlineAnimationState();
    update();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchstart", handleTouchStart, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchmove", handleTouchMove, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchend", handleTouchEnd, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerUp, true);
    resizeObserver.observe(section);
    rows.forEach((row) => resizeObserver.observe(row));
    images.forEach((image) => {
      if (!image) return;
      image.addEventListener("load", scheduleUpdate);
    });
    void document.fonts?.ready.then(scheduleUpdate);

    return () => {
      clearSettleTimer();
      cancelActiveSettle();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("wheel", handleWheel, true);
      window.removeEventListener("touchstart", handleTouchStart, true);
      window.removeEventListener("touchmove", handleTouchMove, true);
      window.removeEventListener("touchend", handleTouchEnd, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerUp, true);
      resizeObserver.disconnect();
      images.forEach((image) => {
        image?.removeEventListener("load", scheduleUpdate);
      });
      if (frame) window.cancelAnimationFrame(frame);
      if (releaseProbeFrame) window.cancelAnimationFrame(releaseProbeFrame);
      frame = 0;
      releaseProbeFrame = 0;
      resetInlineAnimationState();
    };
  }, [desktopUspActive]);

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

      <section
        className="cc-opening"
        aria-labelledby="cc-title"
        data-hero-transition="pinned-cover"
      >
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
              Rank nearby public fishing places for one target, then carry that
              plan into an honest trip log.
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
        className="cc-approach cc-usp-section"
        id="cc-approach"
        aria-labelledby="cc-approach-title"
        data-scroll-linked="true"
      >
        <span
          className="cc-usp-vertical-rail cc-usp-vertical-rail-left"
          data-usp-grid-divider="left"
          aria-hidden="true"
        />
        <span
          className="cc-usp-vertical-rail cc-usp-vertical-rail-right"
          data-usp-grid-divider="right"
          aria-hidden="true"
        />
        <div className="cc-usp-flow" data-usp-flow>
          {daylightStoryBeats.map((story, storyIndex) => {
            const storyNumber = storyIndex + 1;
            const figure = (
              <figure
                className={`cc-usp-side-cell cc-usp-figure cc-usp-figure-${storyNumber}`}
                data-usp-figure={storyNumber}
                data-usp-aspect={story.image.aspect}
                data-usp-side={story.imageSide}
                aria-describedby={
                  story.testFlight ? "cc-usp-mockup-disclosure" : undefined
                }
              >
                <div className="cc-usp-image-frame">
                  <UspImage
                    story={story}
                    sizes="(min-width: 1024px) 24vw, 100vw"
                  />
                </div>
              </figure>
            );

            return (
              <article
                className={`cc-usp-row cc-usp-row-${storyNumber}`}
                data-usp-row={storyNumber}
                key={story.number}
              >
                {story.imageSide === "left" ? (
                  figure
                ) : (
                  <div
                    className="cc-usp-side-cell cc-usp-side-cell-empty"
                    aria-hidden="true"
                  />
                )}
                <div className="cc-usp-center-cell" data-usp-text-clip={storyNumber}>
                  <UspStoryContent story={story} storyIndex={storyIndex} />
                </div>
                {story.imageSide === "right" ? (
                  figure
                ) : (
                  <div
                    className="cc-usp-side-cell cc-usp-side-cell-empty"
                    aria-hidden="true"
                  />
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section
        ref={imageChapterRef}
        className="cc-image-chapter"
        aria-labelledby="cc-image-chapter-title"
        data-image-chapter="daylight"
      >
        <div className="cc-image-chapter-sticky">
          <Image
            src="/marketing/daylight-draft/surf-cast-wide.jpg"
            alt="An angler casting through the surf beneath a warm coastal sky"
            fill
            sizes="100vw"
            unoptimized
          />
          <div className="cc-image-chapter-wash" aria-hidden="true" />
          <div className="cc-image-chapter-copy">
            <span className="cc-image-chapter-mask cc-image-chapter-eyebrow-mask">
              <span data-chapter-line="eyebrow">
                TURN EXPERIENCE INTO CONTEXT
              </span>
            </span>
            <h2 id="cc-image-chapter-title">
              <span className="cc-image-chapter-mask">
                <span data-chapter-line="headline-1">The next trip starts</span>
              </span>
              <span className="cc-image-chapter-mask">
                <span data-chapter-line="headline-2">with this one.</span>
              </span>
            </h2>
            <span className="cc-image-chapter-mask cc-image-chapter-body-mask">
              <span data-chapter-line="body">
                Record the setup, fishability, and full outcome while the
                details are still fresh.
              </span>
            </span>
            <span className="cc-image-chapter-mask cc-image-chapter-action-mask">
              <Link data-chapter-line="action" href="/forecast?report=trip">
                Start a trip report <ArrowIcon />
              </Link>
            </span>
          </div>
        </div>
      </section>

      <section
        className="cc-approach-grid cc-modern-mosaic"
        aria-labelledby="cc-mosaic-title"
      >
        <div className="cc-mosaic-rules" aria-hidden="true" />

        <header className="cc-mosaic-intro">
          <h2 id="cc-mosaic-title">Keep a better log.</h2>
          <p>
            Save the whole attempt, not just the catch. Each trip record
            connects what you planned with what the water actually gave you.
          </p>
        </header>

        {logCards.map((card) => (
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
              <circle
                cx="17.5"
                cy="6.5"
                r="0.8"
                fill="currentColor"
                stroke="none"
              />
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
