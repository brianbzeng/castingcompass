"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

const navItems = [
  ["Home", "/"],
  ["Spots", "/forecast"],
  ["Reports", "/community"],
  ["Maps", "/forecast"],
  ["Community", "/community"],
] as const;

const features = [
  {
    icon: "pin",
    title: "Find Top Spots",
    description:
      "Discover proven spots near you based on real angler catches and local knowledge.",
  },
  {
    icon: "waves",
    title: "Detailed Forecasts",
    description:
      "Get hyperlocal tide, wind, waves, and solunar data you can count on.",
  },
  {
    icon: "fish",
    title: "Species Insights",
    description:
      "Target striped bass and more with seasonal patterns, bait tips, and catch reports.",
  },
  {
    icon: "share",
    title: "Plan & Share",
    description:
      "Save trip, drop pins, and share your success with friends and the community.",
  },
] as const;

const catchReports = [
  {
    image: "/marketing/approved/catch-report-1.webp",
    size: "28 in · 7.4 lbs",
    location: "Maple Point, CA",
    time: "2h ago",
    handle: "CoastalMike",
  },
  {
    image: "/marketing/approved/catch-report-2.webp",
    size: "32 in · 9.1 lbs",
    location: "Bodega Bay, CA",
    time: "4h ago",
    handle: "SaltySarah",
  },
  {
    image: "/marketing/approved/catch-report-3.webp",
    size: "26 in · 6.2 lbs",
    location: "Tomales Bay, CA",
    time: "5h ago",
    handle: "ReelLocal",
  },
  {
    image: "/marketing/approved/catch-report-4.webp",
    size: "30 in · 8.3 lbs",
    location: "Pacifica, CA",
    time: "7h ago",
    handle: "PierCurrent",
  },
] as const;

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

function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Icon>
  );
}

function ArrowIcon() {
  return (
    <Icon size={18}>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </Icon>
  );
}

function PlayIcon() {
  return (
    <span className="cc-play-icon" aria-hidden="true">
      <Icon size={18}>
        <path d="m9 7 7 5-7 5Z" />
      </Icon>
    </span>
  );
}

function FeatureIcon({ name }: { name: (typeof features)[number]["icon"] }) {
  if (name === "pin") {
    return (
      <Icon size={34}>
        <path d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11Z" />
        <circle cx="12" cy="10" r="2" />
        <path d="M4 18 1.5 20.5M20 18l2.5 2.5" />
      </Icon>
    );
  }
  if (name === "waves") {
    return (
      <Icon size={34}>
        <path d="M2 8c3-3 5 3 8 0s5 3 8 0 3 0 4 1M2 13c3-3 5 3 8 0s5 3 8 0 3 0 4 1M2 18c3-3 5 3 8 0s5 3 8 0 3 0 4 1" />
      </Icon>
    );
  }
  if (name === "fish") {
    return (
      <Icon size={36}>
        <path d="M3 12c4-5 9-6 14-2l4-3v10l-4-3c-5 4-10 3-14-2Z" />
        <circle cx="14" cy="11" r="0.7" fill="currentColor" />
      </Icon>
    );
  }
  return (
    <Icon size={35}>
      <path d="M4 12h11M11 6l6 6-6 6" />
      <path d="M17 8h3v8h-3" />
    </Icon>
  );
}

function ForecastCard() {
  const metrics = [
    ["Wind", "8 mph"],
    ["Waves", "1–2 ft"],
    ["Pressure", "30.12 in"],
    ["Tide", "Rising"],
  ] as const;

  return (
    <aside className="cc-forecast-card" aria-label="Example fishing forecast">
      <div className="cc-forecast-summary">
        <span className="cc-weather-sun" aria-hidden="true">
          <i />
        </span>
        <strong>72°F</strong>
        <span>Sunny</span>
      </div>
      <dl className="cc-forecast-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="cc-bite-window">
        <span aria-hidden="true" />
        <p>
          Good bite window
          <strong>9:00 AM - 1:00 PM</strong>
        </p>
      </div>
    </aside>
  );
}

function Gulls() {
  return (
    <svg className="cc-gulls" viewBox="0 0 310 120" aria-hidden="true">
      <g>
        <path d="M8 74q12-14 24 0 12-14 24 0" />
        <path d="M78 42q10-12 20 0 10-12 20 0" />
        <path d="M142 80q13-15 26 0 13-15 26 0" />
        <path d="M208 30q10-12 20 0 10-12 20 0" />
        <path d="M250 68q12-14 24 0 12-14 24 0" />
      </g>
    </svg>
  );
}

function BoatScene() {
  return (
    <div className="cc-boat-scene" aria-hidden="true">
      <Image
        className="cc-boat"
        src="/marketing/approved/boat-fisherman.webp"
        width={1200}
        height={610}
        alt=""
        priority
      />
      <svg className="cc-cast-line" viewBox="0 0 540 320">
        <path d="M275 47C355 58 417 132 454 254" pathLength="1" />
      </svg>
      <span className="cc-bobber">
        <i />
      </span>
    </div>
  );
}

function OceanActors() {
  return (
    <div className="cc-actor-layer" aria-hidden="true">
      <div className="cc-sun">
        <i />
      </div>
      <div className="cc-sun-reflection" />
      <Gulls />
      <BoatScene />

      <div className="cc-light-shafts" />
      <div className="cc-kelp-overlay cc-kelp-overlay-a">
        <Image
          src="/marketing/actors/foreground-kelp.webp"
          width={600}
          height={820}
          alt=""
        />
      </div>
      <div className="cc-kelp-overlay cc-kelp-overlay-b">
        <Image
          src="/marketing/actors/foreground-kelp.webp"
          width={600}
          height={820}
          alt=""
        />
      </div>

      <div className="cc-school cc-school-a">
        <Image
          src="/marketing/silhouettes/school-right.webp"
          width={610}
          height={142}
          alt=""
        />
      </div>
      <div className="cc-school cc-school-b">
        <Image
          src="/marketing/silhouettes/school-left.webp"
          width={540}
          height={145}
          alt=""
        />
      </div>

      <div className="cc-diver cc-diver-a" />
      <div className="cc-diver cc-diver-b" />
      <div className="cc-bubble-sprite cc-bubbles-a" />
      <div className="cc-bubble-sprite cc-bubbles-b" />
      <div className="cc-bubble-sprite cc-bubbles-c" />

      <Image
        className="cc-striped-bass cc-striped-bass-a"
        src="/marketing/approved/striped-bass.webp"
        width={900}
        height={349}
        alt=""
      />
      <Image
        className="cc-striped-bass cc-striped-bass-b"
        src="/marketing/approved/striped-bass.webp"
        width={900}
        height={349}
        alt=""
      />

      <div className="cc-helmet-sprite" />
      <Image
        className="cc-seafloor-anchor"
        src="/marketing/approved/seafloor-anchor.webp"
        width={544}
        height={657}
        alt=""
      />
      <Image
        className="cc-starfish cc-starfish-a"
        src="/marketing/approved/seafloor-starfish.webp"
        width={619}
        height={636}
        alt=""
      />
      <Image
        className="cc-starfish cc-starfish-b"
        src="/marketing/approved/seafloor-starfish.webp"
        width={619}
        height={636}
        alt=""
      />
      <div className="cc-crab cc-crab-a" />
      <div className="cc-crab cc-crab-b" />
    </div>
  );
}

function SocialIcon({ label, children }: { label: string; children: ReactNode }) {
  return (
    <a href="#" aria-label={label} onClick={(event) => event.preventDefault()}>
      {children}
    </a>
  );
}

export function MarketingHome() {
  const rootRef = useRef<HTMLElement>(null);
  const underwaterRef = useRef<HTMLElement>(null);
  const floorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const underwater = underwaterRef.current;
    const floor = floorRef.current;
    if (!root || !underwater || !floor) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      frame = 0;
      const travel = Math.max(window.innerHeight * 0.95, 1);
      const progress = Math.min(1, Math.max(0, window.scrollY / travel));
      const appliedProgress = reducedMotion.matches ? 0 : progress;
      const startAngle = (-65 * Math.PI) / 180;
      const angle = ((-65 + 63 * appliedProgress) * Math.PI) / 180;
      const radius = Math.min(window.innerWidth * 0.46, 460);
      const horizontalScale = window.innerWidth < 700 ? 0.46 : 1;
      const x =
        radius * (Math.cos(angle) - Math.cos(startAngle)) * horizontalScale;
      const y = radius * (Math.sin(angle) - Math.sin(startAngle));

      root.style.setProperty("--cc-scroll", progress.toFixed(4));
      root.style.setProperty("--cc-sun-x", `${x.toFixed(2)}px`);
      root.style.setProperty("--cc-sun-y", `${y.toFixed(2)}px`);
    };

    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    const oceanObserver = new IntersectionObserver(
      ([entry]) => {
        root.classList.toggle("cc-ocean-active", Boolean(entry?.isIntersecting));
      },
      { rootMargin: "18% 0px", threshold: 0.01 },
    );
    const floorObserver = new IntersectionObserver(
      ([entry]) => {
        root.classList.toggle("cc-floor-active", Boolean(entry?.isIntersecting));
      },
      { rootMargin: "18% 0px", threshold: 0.01 },
    );

    oceanObserver.observe(underwater);
    floorObserver.observe(floor);
    root.classList.add("cc-ready");
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    reducedMotion.addEventListener("change", requestUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      oceanObserver.disconnect();
      floorObserver.disconnect();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      reducedMotion.removeEventListener("change", requestUpdate);
    };
  }, []);

  return (
    <main className="marketing-home cc-landing" ref={rootRef}>
      <a className="skip-link cc-skip-link" href="#cc-features">
        Skip to landing page content
      </a>

      <div className="cc-world" aria-hidden="true">
        <div className="cc-world-warmth" />
        <div className="cc-world-depth" />
      </div>
      <OceanActors />

      <header className="cc-navbar">
        <CompassLogo />
        <nav aria-label="Primary navigation">
          {navItems.map(([label, href]) => (
            <Link key={label} href={href} aria-current={label === "Home" ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="cc-nav-actions">
          <Link className="cc-search-link" href="/forecast" aria-label="Search fishing spots">
            <SearchIcon />
          </Link>
          <Link className="cc-sign-in" href="/profile">
            Sign in
          </Link>
          <Link className="cc-sign-up" href="/profile">
            Sign up
          </Link>
        </div>
      </header>

      <section className="cc-hero" aria-labelledby="cc-title">
        <div className="cc-hero-copy">
          <h1 id="cc-title">
            Give every
            <br />
            cast a compass.
          </h1>
          <p>
            Pick your target, compare public shore and pier windows, and see
            which conditions line up before you make the drive.
          </p>
          <div className="cc-hero-actions">
            <Link className="cc-primary-button" href="/forecast">
              <span aria-hidden="true">⌖</span>
              Find best spot near you
              <ArrowIcon />
            </Link>
            <Link className="cc-secondary-button" href="#cc-features">
              <PlayIcon />
              See how it works
            </Link>
          </div>
          <p className="cc-utility-copy">
            <span aria-hidden="true">✓</span>
            No login required to explore
          </p>
          <div className="cc-reviews" aria-label="Trusted by 25,000 plus anglers">
            <div className="cc-review-avatars" aria-hidden="true">
              {catchReports.slice(0, 3).map((report) => (
                <Image
                  key={report.handle}
                  src={report.image}
                  width={38}
                  height={38}
                  alt=""
                  unoptimized
                />
              ))}
            </div>
            <div>
              <span aria-label="5 out of 5 stars">★★★★★</span>
              <small>Trusted by 25,000+ anglers</small>
            </div>
          </div>
        </div>
        <ForecastCard />
      </section>

      <section
        className="cc-features"
        id="cc-features"
        ref={underwaterRef}
        aria-labelledby="cc-features-title"
      >
        <div className="cc-section-heading">
          <h2 id="cc-features-title">
            Everything you need for
            <br />a successful day on the water.
          </h2>
        </div>
        <div className="cc-feature-grid">
          {features.map((feature) => (
            <article key={feature.title}>
              <span className={`cc-feature-icon cc-feature-icon-${feature.icon}`}>
                <FeatureIcon name={feature.icon} />
              </span>
              <div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="cc-reports" aria-labelledby="cc-reports-title">
        <header>
          <div>
            <p>Sample community preview</p>
            <h2 id="cc-reports-title">Recent Catch Reports</h2>
          </div>
          <Link href="/community">
            View all reports <ArrowIcon />
          </Link>
        </header>
        <div className="cc-report-grid">
          {catchReports.map((report) => (
            <article key={report.handle}>
              <Image
                src={report.image}
                width={720}
                height={520}
                sizes="(max-width: 680px) 88vw, (max-width: 1000px) 42vw, 22vw"
                alt={`Sample catch report portrait for ${report.handle}`}
              />
              <div>
                <h3>Striped Bass</h3>
                <p>{report.size}</p>
                <p>{report.location}</p>
                <p>{report.time}</p>
                <span>
                  <i aria-hidden="true">{report.handle.charAt(0)}</i>
                  {report.handle}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="cc-newsletter" ref={floorRef} aria-labelledby="cc-newsletter-title">
        <span className="cc-mail-icon" aria-hidden="true">
          <Icon size={30}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m4 7 8 6 8-6" />
          </Icon>
        </span>
        <div>
          <h2 id="cc-newsletter-title">Stay in the know</h2>
          <p>
            Weekly fishing tips, bite alerts, and exclusive spot
            recommendations.
          </p>
        </div>
        <form>
          <label className="sr-only" htmlFor="cc-newsletter-email">
            Email address
          </label>
          <input
            id="cc-newsletter-email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="Enter your email"
          />
          <button
            type="button"
            aria-disabled="true"
            title="Newsletter signup is not active in this review build"
          >
            Subscribe
          </button>
        </form>
      </section>

      <footer className="cc-footer">
        <CompassLogo compact />
        <nav aria-label="Footer links">
          <Link href="/ai-disclosure">About</Link>
          <Link href="/community">Contact</Link>
          <Link href="/community">Careers</Link>
          <Link href="/community">Press</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <div className="cc-socials">
          <SocialIcon label="Instagram">◎</SocialIcon>
          <SocialIcon label="Facebook">f</SocialIcon>
          <SocialIcon label="YouTube">▶</SocialIcon>
          <SocialIcon label="X">𝕏</SocialIcon>
        </div>
        <p>© 2024 CastingCompass. All rights reserved.</p>
      </footer>
    </main>
  );
}
