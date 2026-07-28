"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

function ArrowUpRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M5 15 15 5M7 5h8v8" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 3v13m-5-5 5 5 5-5" />
    </svg>
  );
}

function CoastSignalArtwork() {
  return (
    <svg
      className="marketing-coast-art"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cc-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1f6eb4" />
          <stop offset="0.56" stopColor="#15558f" />
          <stop offset="1" stopColor="#0b2d56" />
        </linearGradient>
        <radialGradient id="cc-glow" cx="0.56" cy="0.46" r="0.48">
          <stop offset="0" stopColor="#a8d8f2" stopOpacity="0.28" />
          <stop offset="1" stopColor="#a8d8f2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cc-water" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#071f3d" />
          <stop offset="0.52" stopColor="#104477" />
          <stop offset="1" stopColor="#08284d" />
        </linearGradient>
        <filter id="cc-soft-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>

      <rect width="1600" height="1000" fill="url(#cc-sky)" />
      <rect width="1600" height="1000" fill="url(#cc-glow)" />

      <g className="marketing-art-stars" fill="#d8ed94">
        <circle cx="186" cy="147" r="3" />
        <circle cx="370" cy="224" r="2" />
        <circle cx="585" cy="116" r="2.5" />
        <circle cx="887" cy="178" r="2" />
        <circle cx="1198" cy="110" r="3" />
        <circle cx="1400" cy="248" r="2.5" />
      </g>

      <g
        className="marketing-art-contours marketing-art-contours-far"
        fill="none"
        stroke="#a8d8f2"
        strokeLinecap="round"
      >
        <path d="M-110 316C194 174 359 429 644 305s492-169 755-56 415-18 431-26" />
        <path d="M-92 355C194 224 388 466 670 341s488-163 739-58 396-20 428-20" />
        <path d="M-74 395C211 271 406 506 691 379s476-149 718-54 384-15 418-16" />
      </g>

      <g className="marketing-art-hills marketing-art-hills-back">
        <path
          d="M0 534c151-74 254-89 355-43 86 39 153 46 268-14 94-49 174-69 283-19 128 59 258 51 393-29 101-60 205-58 301-3v365H0Z"
          fill="#0d3c6d"
        />
        <path
          d="M0 619c151-98 309-82 431 2 93 64 198 49 304-27 120-86 218-76 337 14 113 85 228 91 370 6 68-40 120-42 158-24v223H0Z"
          fill="#0a315d"
        />
      </g>

      <g
        className="marketing-art-contours marketing-art-contours-land"
        fill="none"
        stroke="#a8d8f2"
        strokeLinecap="round"
      >
        <path d="M-120 675c168-129 321-106 459 3 118 94 228 85 349-17 145-123 268-112 413 7 127 105 251 112 421 4 70-44 143-51 225-23" />
        <path d="M-120 710c176-121 320-94 455 14 120 96 230 89 355-12 148-120 270-108 414 9 128 105 257 111 427 2 69-44 139-53 218-29" />
        <path d="M-120 746c184-112 325-80 456 26 120 97 232 91 360-9 150-117 273-103 416 13 129 105 261 109 431-1 68-44 135-55 209-36" />
      </g>

      <path
        className="marketing-art-water"
        d="M0 698c205-50 385 39 590 7 245-39 426-20 636 10 135 20 247 8 374-29v314H0Z"
        fill="url(#cc-water)"
      />

      <g
        className="marketing-art-waves"
        fill="none"
        stroke="#a8d8f2"
        strokeLinecap="round"
      >
        <path d="M-80 755c192-46 338 54 532 5s335 37 521 2 336 46 707-17" />
        <path d="M-90 796c192-44 338 55 532 8s335 40 521 5 336 47 707-16" />
        <path d="M-100 842c192-42 338 57 532 11s335 42 521 8 336 49 707-14" />
        <path d="M-120 894c192-40 338 59 532 14s335 44 521 11 336 51 707-12" />
      </g>

      <g className="marketing-art-headland">
        <path
          d="M0 536c108 6 198 59 252 161 27 50 41 115 49 194H0Z"
          fill="#061a33"
        />
        <path
          d="M1600 450c-128 17-220 80-284 186-49 81-68 172-75 279h359Z"
          fill="#061a33"
        />
      </g>

      <g className="marketing-art-marker">
        <circle
          className="marketing-marker-glow"
          cx="1030"
          cy="630"
          r="70"
          fill="#a8d8f2"
          opacity="0.22"
          filter="url(#cc-soft-glow)"
        />
        <circle className="marketing-marker-ring marketing-marker-ring-one" cx="1030" cy="630" r="42" />
        <circle className="marketing-marker-ring marketing-marker-ring-two" cx="1030" cy="630" r="20" />
        <path d="M1030 597v66M997 630h66" stroke="#d8ed94" strokeWidth="3" />
        <circle cx="1030" cy="630" r="6" fill="#d8ed94" />
      </g>
    </svg>
  );
}

function PlannerPreview() {
  return (
    <div className="marketing-planner-preview" aria-label="Illustrative web planner preview">
      <div className="marketing-preview-toolbar">
        <span><i aria-hidden="true" /> CastingCompass</span>
        <span>Updated 18 min ago</span>
      </div>
      <div className="marketing-preview-heading">
        <div>
          <span>California halibut planning</span>
          <strong>Find the water<br />worth fishing.</strong>
        </div>
        <div className="marketing-preview-score">
          <span>78</span>
          <small>relative score</small>
        </div>
      </div>
      <div className="marketing-preview-species" aria-label="Illustrative target species selector">
        <span className="active">Halibut</span>
        <span>Striped bass</span>
        <span>Surfperch</span>
        <span>Jacksmelt</span>
      </div>
      <div className="marketing-preview-grid">
        <div className="marketing-preview-map">
          <span className="marketing-preview-map-line one" />
          <span className="marketing-preview-map-line two" />
          <span className="marketing-preview-map-line three" />
          <i aria-hidden="true" />
          <small>Ocean Beach North</small>
        </div>
        <div className="marketing-preview-windows">
          <article>
            <span>06:40–08:40</span>
            <strong>Incoming tide</strong>
            <small>Structure + fishability align</small>
          </article>
          <article>
            <span>17:10–19:10</span>
            <strong>Evening window</strong>
            <small>Lower wind, usable swell</small>
          </article>
        </div>
      </div>
    </div>
  );
}

export function MarketingHome() {
  const rootRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const revealRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const hero = heroRef.current;
    const reveal = revealRef.current;
    if (!root || !hero || !reveal) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      frame = 0;
      if (reducedMotion.matches) {
        root.style.setProperty("--marketing-hero-progress", "1");
        root.style.setProperty("--marketing-wash-progress", "1");
        return;
      }

      const heroRect = hero.getBoundingClientRect();
      const heroTravel = Math.max(hero.offsetHeight - window.innerHeight, 1);
      const heroProgress = Math.min(1, Math.max(0, -heroRect.top / heroTravel));

      const revealRect = reveal.getBoundingClientRect();
      const revealTravel = Math.max(reveal.offsetHeight - window.innerHeight, 1);
      const washProgress = Math.min(1, Math.max(0, -revealRect.top / revealTravel));

      root.style.setProperty("--marketing-hero-progress", heroProgress.toFixed(4));
      root.style.setProperty("--marketing-wash-progress", washProgress.toFixed(4));
    };

    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    reducedMotion.addEventListener("change", requestUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      reducedMotion.removeEventListener("change", requestUpdate);
    };
  }, []);

  return (
    <main className="marketing-home" ref={rootRef}>
      <a className="skip-link marketing-skip-link" href="#product">Skip to product overview</a>

      <section className="marketing-hero-scroll" ref={heroRef} aria-labelledby="marketing-title">
        <div className="marketing-hero-sticky">
          <div className="marketing-art-frame">
            <CoastSignalArtwork />
            <div className="marketing-art-vignette" />
          </div>

          <header className="marketing-nav">
            <Link className="marketing-brand" href="/" aria-label="CastingCompass home">
              <span className="marketing-brand-mark" aria-hidden="true">
                <i />
                <i />
              </span>
              <span>CastingCompass</span>
            </Link>
            <nav aria-label="Primary navigation">
              <Link href="/forecast">Forecast</Link>
              <Link href="/community">Community</Link>
              <Link href="/ai-disclosure">How it works</Link>
            </nav>
            <Link className="marketing-nav-cta" href="/forecast">
              Open web app
              <ArrowUpRightIcon />
            </Link>
          </header>

          <div className="marketing-hero-copy">
            <p className="marketing-kicker"><span /> California coast · planning beta</p>
            <h1 id="marketing-title">Read the coast<br />before you cast.</h1>
            <p>
              Compare public shore and pier windows with an explainable relative-ranking
              planner tuned to one target species at a time.
            </p>
            <div className="marketing-hero-actions">
              <Link className="marketing-action marketing-action-primary" href="/forecast">
                Open web planner
                <ArrowUpRightIcon />
              </Link>
              <button
                className="marketing-action marketing-action-testflight"
                type="button"
                disabled
                aria-label="TestFlight download — coming soon"
                title="TestFlight beta is not available yet"
              >
                <span className="marketing-testflight-blur" aria-hidden="true">TestFlight</span>
                <span>Coming soon</span>
              </button>
            </div>
          </div>

          <div className="marketing-window-callout" aria-hidden="true">
            <span>Next usable window</span>
            <strong>06:40</strong>
            <small>Incoming tide · lighter wind</small>
          </div>

          <div className="marketing-hero-notes">
            <article>
              <span>01</span>
              <div>
                <strong>A signal, not a promise.</strong>
                <p>Scores compare the current options. They do not predict a catch or prove fish are present.</p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <strong>One target at a time.</strong>
                <p>Swap between halibut, striped bass, surfperch, and jacksmelt without rebuilding your plan.</p>
              </div>
            </article>
          </div>

          <a className="marketing-scroll-cue" href="#product">
            Explore the planner
            <ArrowDownIcon />
          </a>
        </div>
      </section>

      <section className="marketing-wash-scroll" ref={revealRef}>
        <div className="marketing-wash-sticky">
          <div className="marketing-wash-dark-copy" aria-hidden="true">
            <span>The tide turns.</span>
          </div>
          <div className="marketing-wash-surface" id="product">
            <div className="marketing-wash-edge" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="marketing-product">
              <header>
                <p className="marketing-light-kicker">The web planner</p>
                <h2>One target.<br />One clear plan.</h2>
                <p>
                  CastingCompass re-ranks the same public places and conditions with a
                  versioned target profile. It is an expert-configured hybrid planning
                  baseline—not a trained catch-probability engine.
                </p>
              </header>
              <PlannerPreview />
              <div className="marketing-product-actions">
                <Link className="marketing-action marketing-action-ink" href="/forecast">
                  Plan on the web
                  <ArrowUpRightIcon />
                </Link>
                <Link className="marketing-product-link" href="/community">
                  Browse place communities
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-proof" aria-labelledby="marketing-proof-title">
        <div className="marketing-proof-intro">
          <p className="marketing-kicker"><span /> What the ranking considers</p>
          <h2 id="marketing-proof-title">Less guesswork.<br />More time in usable water.</h2>
        </div>
        <div className="marketing-proof-grid">
          <article>
            <span>01</span>
            <h3>Structure + season</h3>
            <p>Habitat and time-of-year priors establish a transparent baseline for each supported target.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Conditions now</h3>
            <p>Tide, current, wind, swell, wave power, temperature, light, pressure, and freshness shape the comparison.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Fishability matters</h3>
            <p>A high raw opportunity score cannot hide water that is difficult, stale, posted, or impractical to fish.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Public-place context</h3>
            <p>Moderated community previews add broad public-place context without exposing private or exact locations.</p>
          </article>
        </div>
        <div className="marketing-proof-cta">
          <div>
            <span>Ready when the coast is.</span>
            <strong>Find the water worth fishing.</strong>
          </div>
          <Link className="marketing-action marketing-action-primary" href="/forecast">
            Open CastingCompass
            <ArrowUpRightIcon />
          </Link>
        </div>
      </section>

      <footer className="marketing-footer">
        <Link className="marketing-brand" href="/" aria-label="CastingCompass home">
          <span className="marketing-brand-mark" aria-hidden="true"><i /><i /></span>
          <span>CastingCompass</span>
        </Link>
        <p>California coastal fishing planning. Relative rankings, never catch guarantees or safety advice.</p>
        <nav aria-label="Footer">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/ai-disclosure">AI disclosure</Link>
        </nav>
      </footer>
    </main>
  );
}
