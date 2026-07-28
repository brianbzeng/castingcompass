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
          <stop offset="0" stopColor="#6350a4" />
          <stop offset="0.46" stopColor="#d66f91" />
          <stop offset="0.78" stopColor="#f6a46f" />
          <stop offset="1" stopColor="#ffd27e" />
        </linearGradient>
        <radialGradient id="cc-glow" cx="0.79" cy="0.42" r="0.45">
          <stop offset="0" stopColor="#ffeaa0" stopOpacity="0.92" />
          <stop offset="0.38" stopColor="#ffbd77" stopOpacity="0.34" />
          <stop offset="1" stopColor="#ffbd77" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cc-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#268c8c" />
          <stop offset="0.48" stopColor="#176b76" />
          <stop offset="1" stopColor="#20385f" />
        </linearGradient>
        <linearGradient id="cc-water-light" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ffbd78" stopOpacity="0" />
          <stop offset="0.76" stopColor="#ffd993" stopOpacity="0.74" />
          <stop offset="1" stopColor="#fff0be" stopOpacity="0.08" />
        </linearGradient>
        <filter id="cc-sun-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="34" />
        </filter>
      </defs>

      <rect width="1600" height="1000" fill="url(#cc-sky)" />
      <rect width="1600" height="1000" fill="url(#cc-glow)" />

      <g className="marketing-art-sun">
        <circle cx="1270" cy="405" r="112" fill="#ffe69a" opacity="0.34" filter="url(#cc-sun-glow)" />
        <circle cx="1270" cy="405" r="52" fill="#fff0b0" />
      </g>

      <g
        className="marketing-art-contours marketing-art-contours-far"
        fill="none"
        stroke="#ffeab1"
        strokeLinecap="round"
      >
        <path d="M-120 194c250-132 421 68 663-36s430-98 623 4 365 74 564-34" />
        <path d="M-112 235c247-125 421 75 660-31s421-94 617 9 370 70 572-39" />
        <path d="M-100 278c242-119 416 78 654-27s420-87 616 13 370 66 573-44" />
      </g>

      <g className="marketing-art-clouds">
        <path
          d="M-50 303c180-41 293-34 420 2 158 44 254 22 389-8 151-34 253-23 391 10 151 37 290 39 500-15"
          fill="none"
          stroke="#ffd3aa"
          strokeLinecap="round"
          strokeWidth="34"
          opacity="0.22"
        />
        <path
          d="M-30 370c166-27 288-12 409 27 143 46 266 29 411-6 164-40 279-24 415 22 147 50 270 51 449 5"
          fill="none"
          stroke="#ffe3bf"
          strokeLinecap="round"
          strokeWidth="18"
          opacity="0.16"
        />
      </g>

      <g className="marketing-art-islands marketing-art-islands-far">
        <path
          d="M-30 575c88-5 142-21 201-36 83-22 135 9 211 13 83 4 125-37 197-48 99-15 155 48 248 42 92-6 134-45 225-42 79 3 134 48 225 42 78-5 119-37 183-32 77 6 122 44 170 49v92H-30Z"
          fill="#68517d"
        />
        <path
          d="M-20 601c102-1 169-26 249-17 77 8 117 36 202 28 82-8 131-40 212-32 86 8 130 44 228 32 91-11 142-45 224-32 77 12 108 39 193 32 80-7 135-37 178-27 55 13 88 24 144 22v64H-20Z"
          fill="#3f526d"
          opacity="0.84"
        />
      </g>

      <path
        className="marketing-art-water"
        d="M0 603c230-17 361 19 570 2 257-21 411-12 638 4 147 10 253 5 392-13v404H0Z"
        fill="url(#cc-water)"
      />
      <path
        className="marketing-art-sun-path"
        d="M930 611c153-14 268-13 476 2l-93 387H997Z"
        fill="url(#cc-water-light)"
        opacity="0.58"
      />

      <g
        className="marketing-art-waves"
        fill="none"
        stroke="#bce5d7"
        strokeLinecap="round"
      >
        <path d="M-90 678c203-34 333 42 534 7s348 30 550 1 348 35 699-13" />
        <path d="M-90 739c203-32 333 43 534 10s348 32 550 3 348 37 699-11" />
        <path d="M-90 809c203-30 333 45 534 13s348 35 550 6 348 39 699-8" />
        <path d="M-90 891c203-28 333 47 534 16s348 37 550 9 348 41 699-5" />
      </g>

      <g className="marketing-art-foreground">
        <path
          d="M0 865c152-64 302-44 447 18 128 55 262 55 391 7 150-56 293-63 430-5 113 47 223 46 332 4v111H0Z"
          fill="#273557"
          opacity="0.72"
        />
      </g>

      <g className="marketing-art-marker">
        <circle
          className="marketing-marker-glow"
          cx="1054"
          cy="681"
          r="70"
          fill="#ffe281"
          opacity="0.22"
          filter="url(#cc-sun-glow)"
        />
        <circle className="marketing-marker-ring marketing-marker-ring-one" cx="1054" cy="681" r="42" />
        <circle className="marketing-marker-ring marketing-marker-ring-two" cx="1054" cy="681" r="20" />
        <path d="M1054 648v66M1021 681h66" stroke="#ffe281" strokeWidth="3" />
        <circle cx="1054" cy="681" r="6" fill="#ffe281" />
      </g>
    </svg>
  );
}

function WaveTransitionArtwork() {
  return (
    <svg
      className="marketing-wave-art"
      viewBox="0 0 1600 280"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cc-wave" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5bc4ae" />
          <stop offset="0.5" stopColor="#258f89" />
          <stop offset="1" stopColor="#176b76" />
        </linearGradient>
        <linearGradient id="cc-wave-shadow" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#514475" />
          <stop offset="0.5" stopColor="#1a6e76" />
          <stop offset="1" stopColor="#263b61" />
        </linearGradient>
      </defs>
      <path
        className="marketing-wave-shadow"
        d="M0 183c204-20 310 32 491 26 239-8 332-115 535-105 199 10 301 99 574 69v107H0Z"
        fill="url(#cc-wave-shadow)"
      />
      <path
        className="marketing-wave-body"
        d="M0 205c193-13 318 33 493 24 218-11 298-79 414-141 116-62 247-35 339 18 112 65 210 113 354 87v87H0Z"
        fill="url(#cc-wave)"
      />
      <path
        className="marketing-wave-foam"
        d="M-12 204c201-18 327 34 503 23 211-13 291-76 414-140 119-62 247-34 342 18 115 63 213 111 368 85"
        fill="none"
        stroke="#fff0c8"
        strokeLinecap="round"
        strokeWidth="14"
      />
      <path
        className="marketing-wave-foam-detail"
        d="M897 88c43 5 75 25 92 58M951 75c49 10 82 38 92 76M1084 83c48 14 78 43 87 80"
        fill="none"
        stroke="#fff8dc"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path d="M0 245c272-17 457 25 697 3s430-26 903 3v29H0Z" fill="#fff0d6" />
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
            <span>Follow the horizon.</span>
          </div>
          <div className="marketing-wash-surface" id="product">
            <div className="marketing-wash-edge">
              <WaveTransitionArtwork />
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
