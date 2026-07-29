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

      <g className="marketing-art-sun">
        <g className="marketing-art-sun-rays">
          {Array.from({ length: 12 }, (_, index) => (
            <line
              key={index}
              x1="1010"
              y1="282"
              x2="1010"
              y2="258"
              transform={`rotate(${index * 30} 1010 370)`}
            />
          ))}
        </g>
        <circle cx="1010" cy="370" r="118" fill="#ffe69a" opacity="0.3" filter="url(#cc-sun-glow)" />
        <circle className="marketing-art-sun-disc" cx="1010" cy="370" r="52" fill="#fff0b0" />
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
        d="M800 611c153-14 268-13 476 2l-93 387H867Z"
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

const rankingFeatures = [
  ["Tide + current", "Direction, stage, and current strength shape the usable window."],
  ["Wind + swell", "Wind, swell, and wave power temper raw opportunity with fishability."],
  ["Structure + season", "Habitat and time-of-year priors set a target-specific baseline."],
  ["Light + water", "Temperature, light, and pressure add current environmental context."],
  ["Freshness", "Older source observations are made visible and discounted where appropriate."],
  ["Access + usability", "Posted access and practical fishing conditions can cap the final rank."],
] as const;

function RodLoadingVisual() {
  return (
    <div className="marketing-rod-loader" aria-hidden="true">
      <span className="marketing-rod-label">Signal line · one target</span>
      <svg viewBox="0 0 700 500" preserveAspectRatio="xMidYMid meet">
        <g className="marketing-rod-currents" fill="none" strokeLinecap="round">
          <path d="M-30 340c120-38 209 30 329 0s220 35 431-6" />
          <path d="M-25 392c120-34 209 33 329 4s220 38 431-2" />
          <path d="M-20 446c120-30 209 37 329 8s220 41 431 3" />
        </g>
        <path
          className="marketing-rod-track"
          d="M112 438C151 336 188 232 270 128"
          fill="none"
          strokeLinecap="round"
          strokeWidth="16"
        />
        <path
          className="marketing-rod-fill"
          d="M112 438C151 336 188 232 270 128"
          fill="none"
          strokeLinecap="round"
          strokeWidth="7"
        />
        <path
          className="marketing-line-track"
          d="M270 128C391 10 597 46 626 278"
          fill="none"
          strokeLinecap="round"
          strokeWidth="6"
        />
        <path
          className="marketing-line-fill"
          d="M270 128C391 10 597 46 626 278"
          fill="none"
          strokeLinecap="round"
          strokeWidth="6"
        />
        <g className="marketing-rod-reel">
          <circle cx="122" cy="410" r="31" />
          <circle cx="122" cy="410" r="12" />
          <path d="m144 427 28 30" />
        </g>
        <g className="marketing-line-lure">
          <circle cx="626" cy="278" r="10" />
          <circle cx="626" cy="278" r="25" />
          <path d="M626 289v23c0 12 18 13 18 0" />
        </g>
        <g className="marketing-rod-signals">
          <g><circle cx="318" cy="319" r="8" /><circle cx="318" cy="319" r="22" /></g>
          <g><circle cx="407" cy="376" r="8" /><circle cx="407" cy="376" r="22" /></g>
          <g><circle cx="505" cy="327" r="8" /><circle cx="505" cy="327" r="22" /></g>
          <g><circle cx="602" cy="402" r="8" /><circle cx="602" cy="402" r="22" /></g>
        </g>
      </svg>
      <p><strong>Cast one question.</strong> The signal line fills as each condition joins the rank.</p>
    </div>
  );
}

function TreasureMapArtwork() {
  return (
    <svg
      className="marketing-treasure-map-art"
      viewBox="0 0 1600 1100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="cc-map-grid" width="84" height="84" patternUnits="userSpaceOnUse">
          <path d="M84 0H0v84" fill="none" stroke="#8a5b62" strokeOpacity="0.15" strokeWidth="2" />
        </pattern>
      </defs>
      <rect width="1600" height="1100" fill="url(#cc-map-grid)" />
      <path
        d="M-80 100c208 75 247 194 217 315-33 133 31 210 178 243 128 29 199 113 193 264-4 94 20 157 93 218H-80Z"
        fill="#f49a73"
        opacity="0.76"
      />
      <path
        d="M1680 67c-154 31-250 124-272 258-21 128-91 180-214 208-140 32-216 116-222 249-5 109-55 216-150 318h858Z"
        fill="#42aa9d"
        opacity="0.72"
      />
      <g fill="#ffe9a8" stroke="#68415e" strokeWidth="5">
        <path d="M538 191c47-55 121-62 175-13 42 38 32 91-20 115-68 32-132 11-173-30-21-21-13-48 18-72Z" />
        <path d="M760 715c55-52 139-47 179 16 32 51 1 103-63 114-77 14-140-21-164-72-13-27 8-46 48-58Z" />
        <path d="M1118 184c33-30 83-27 108 10 20 31 2 63-37 72-45 10-84-8-101-39-10-18 1-31 30-43Z" />
      </g>
      <path
        className="marketing-map-route"
        d="M293 811C447 705 434 498 615 427c154-61 257 90 399 3 112-69 129-181 273-216"
        fill="none"
        stroke="#4a365f"
        strokeDasharray="18 18"
        strokeLinecap="round"
        strokeWidth="8"
      />
      <g className="marketing-map-compass" transform="translate(1240 188)">
        <circle r="88" fill="#ffe9a8" stroke="#4a365f" strokeWidth="6" />
        <circle r="62" fill="none" stroke="#4a365f" strokeWidth="3" />
        <path d="M0-72 18-12 0 0-18-12ZM72 0 12 18 0 0 12-18ZM0 72-18 12 0 0 18 12ZM-72 0-12-18 0 0-12 18Z" fill="#e46f6f" stroke="#4a365f" strokeLinejoin="round" strokeWidth="3" />
        <text x="0" y="-101" fill="#4a365f" fontSize="30" fontWeight="800" textAnchor="middle">N</text>
      </g>
      <g className="marketing-map-x" transform="translate(1304 772)" fill="none" stroke="#68415e" strokeLinecap="round" strokeWidth="17">
        <path d="m-30-30 60 60M30-30l-60 60" />
        <circle r="57" strokeWidth="5" />
      </g>
      <g fill="#68415e" opacity="0.7">
        <circle cx="293" cy="811" r="12" />
        <circle cx="615" cy="427" r="12" />
        <circle cx="1014" cy="430" r="12" />
        <circle cx="1287" cy="214" r="12" />
      </g>
    </svg>
  );
}

function SunsetBannerArtwork() {
  return (
    <svg
      className="marketing-sunset-banner-art"
      viewBox="0 0 1600 560"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cc-banner-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#556b8e" />
          <stop offset="0.58" stopColor="#d69b83" />
          <stop offset="1" stopColor="#f4c47e" />
        </linearGradient>
        <radialGradient id="cc-banner-glow" cx="0.79" cy="0.49" r="0.25">
          <stop offset="0" stopColor="#fff2b1" stopOpacity="0.84" />
          <stop offset="1" stopColor="#fff2b1" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="560" fill="url(#cc-banner-sky)" />
      <rect width="1600" height="560" fill="url(#cc-banner-glow)" />
      <circle cx="1265" cy="278" r="56" fill="#fff0ad" />
      <path d="M0 353c206-18 373 16 588 0s367 8 557-3 309-7 455 9v201H0Z" fill="#275c6e" />
      <g className="marketing-banner-pier" fill="none" stroke="#302f42" strokeLinecap="round">
        <path d="M380 347h785" strokeWidth="12" />
        <path d="M410 347v75M495 347v68M580 347v74M665 347v64M750 347v72M835 347v65M920 347v70M1005 347v62M1090 347v69" strokeWidth="7" />
        <path d="m380 347 66-21h719" strokeWidth="5" />
      </g>
      <path
        className="marketing-banner-cliff"
        d="M1600 0h-148c-15 54-37 92-69 131-50 61-48 104-86 151-42 52-65 76-92 130-25 51-55 99-108 148h503Z"
        fill="#2d303f"
      />
      <path d="M0 458c203-31 406 25 588 3s334-5 517 19 328 23 495-17v97H0Z" fill="#272a3a" opacity="0.84" />
    </svg>
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

    const setSunOrbit = (progress: number) => {
      const startAngle = (-62 * Math.PI) / 180;
      const angle = ((-62 + (44 * progress)) * Math.PI) / 180;
      const radius = 270;
      const horizontalScale = window.innerWidth <= 760 ? 0.38 : 1;
      const x = radius * (Math.cos(angle) - Math.cos(startAngle)) * horizontalScale;
      const y = radius * (Math.sin(angle) - Math.sin(startAngle));

      root.style.setProperty("--marketing-sun-orbit-x", `${x.toFixed(2)}px`);
      root.style.setProperty("--marketing-sun-orbit-y", `${y.toFixed(2)}px`);
      root.style.setProperty("--marketing-sun-progress", progress.toFixed(4));
    };

    const update = () => {
      frame = 0;
      if (reducedMotion.matches) {
        root.style.setProperty("--marketing-hero-progress", "1");
        root.style.setProperty("--marketing-wash-progress", "1");
        setSunOrbit(1);
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
      setSunOrbit(heroProgress);
    };

    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    if (reducedMotion.matches) {
      update();
    } else if (window.scrollY > 0) {
      requestUpdate();
    }
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
            <div className="marketing-art-nightfall" />
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
            <h1 id="marketing-title">Give every cast<br />a compass.</h1>
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
                aria-disabled="true"
                aria-label="TestFlight download — coming soon"
                title="TestFlight beta is not available yet"
              >
                <span className="marketing-testflight-wordmark" aria-hidden="true">TestFlight</span>
                <span className="marketing-testflight-status" aria-hidden="true">Coming soon</span>
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
          <div className="marketing-current-field" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="marketing-wash-surface" id="product">
            <div className="marketing-wash-edge">
              <WaveTransitionArtwork />
            </div>
            <div className="marketing-product">
              <header>
                <p className="marketing-light-kicker">Inside the ranking</p>
                <h2>Read every<br />signal together.</h2>
                <p>
                  CastingCompass combines current conditions with a versioned profile for
                  the selected species, then compares the available windows. It is an
                  expert-configured hybrid planning baseline—not a catch-probability engine.
                </p>
              </header>
              <div className="marketing-model-panel">
                <RodLoadingVisual />
                <ol className="marketing-model-features" aria-label="Signals used by the relative ranking model">
                  {rankingFeatures.map(([title, description], index) => (
                    <li key={title}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{title}</strong>
                        <p>{description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
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
        <TreasureMapArtwork />
        <div className="marketing-proof-intro">
          <p className="marketing-kicker"><span /> What the product protects</p>
          <h2 id="marketing-proof-title">Useful context.<br />Honest boundaries.</h2>
        </div>
        <div className="marketing-proof-grid">
          <article>
            <span>01</span>
            <h3>One selected target</h3>
            <p>Swap species quickly while keeping one clear target in focus throughout the plan.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Freshness made visible</h3>
            <p>Useful source age appears in plain language instead of exposing internal cache terminology.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Public-place context</h3>
            <p>Moderated community previews add broad context without exposing private or exact locations.</p>
          </article>
          <article>
            <span>04</span>
            <h3>A rank, not a promise</h3>
            <p>The score compares current options. It does not predict a catch or prove fish are present.</p>
          </article>
        </div>
        <div className="marketing-sunset-banner">
          <SunsetBannerArtwork />
          <div className="marketing-sunset-banner-vignette" aria-hidden="true" />
          <div className="marketing-sunset-banner-copy">
            <span>Ready when the coast is.</span>
            <h3>Meet the water<br />where it is.</h3>
            <p>Choose a target, compare the public options, and carry an honest plan to the shore.</p>
            <Link className="marketing-action marketing-action-primary" href="/forecast">
              Open CastingCompass
              <ArrowUpRightIcon />
            </Link>
          </div>
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
