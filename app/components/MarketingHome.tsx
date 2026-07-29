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
    <svg className="marketing-coast-art" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="cc-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#62b7df" />
          <stop offset="0.44" stopColor="#8ecfe1" />
          <stop offset="0.78" stopColor="#c9e0db" />
          <stop offset="1" stopColor="#ffe4aa" />
        </linearGradient>
        <linearGradient id="cc-sunset-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#544889" />
          <stop offset="0.44" stopColor="#a85d91" />
          <stop offset="0.76" stopColor="#e9848d" />
          <stop offset="1" stopColor="#ffbc7a" />
        </linearGradient>
        <linearGradient id="cc-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#43aeb0" />
          <stop offset="0.48" stopColor="#237e89" />
          <stop offset="1" stopColor="#20385f" />
        </linearGradient>
        <linearGradient id="cc-water-sunset" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a888b" />
          <stop offset="0.5" stopColor="#1b6677" />
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
      <rect className="marketing-art-sunset" width="1600" height="1000" fill="url(#cc-sunset-sky)" />

      <g className="marketing-art-sun">
        <g className="marketing-art-sun-rays">
          {Array.from({ length: 12 }, (_, index) => (
            <line key={index} x1="1010" y1="282" x2="1010" y2="258" transform={`rotate(${index * 30} 1010 370)`} />
          ))}
        </g>
        <circle cx="1010" cy="370" r="118" fill="#ffe69a" opacity="0.3" filter="url(#cc-sun-glow)" />
        <circle className="marketing-art-sun-disc" cx="1010" cy="370" r="52" fill="#fff0b0" />
      </g>

      <g className="marketing-art-contours marketing-art-contours-far" fill="none" stroke="#ffeab1" strokeLinecap="round">
        <path d="M-120 194c250-132 421 68 663-36s430-98 623 4 365 74 564-34" />
        <path d="M-112 235c247-125 421 75 660-31s421-94 617 9 370 70 572-39" />
        <path d="M-100 278c242-119 416 78 654-27s420-87 616 13 370 66 573-44" />
      </g>

      <g className="marketing-art-clouds">
        <path d="M-50 303c180-41 293-34 420 2 158 44 254 22 389-8 151-34 253-23 391 10 151 37 290 39 500-15" fill="none" stroke="#ffd3aa" strokeLinecap="round" strokeWidth="34" opacity="0.22" />
        <path d="M-30 370c166-27 288-12 409 27 143 46 266 29 411-6 164-40 279-24 415 22 147 50 270 51 449 5" fill="none" stroke="#ffe3bf" strokeLinecap="round" strokeWidth="18" opacity="0.16" />
      </g>

      <g className="marketing-art-islands marketing-art-islands-far">
        <path d="M-30 575c88-5 142-21 201-36 83-22 135 9 211 13 83 4 125-37 197-48 99-15 155 48 248 42 92-6 134-45 225-42 79 3 134 48 225 42 78-5 119-37 183-32 77 6 122 44 170 49v92H-30Z" fill="#68517d" />
        <path d="M-20 601c102-1 169-26 249-17 77 8 117 36 202 28 82-8 131-40 212-32 86 8 130 44 228 32 91-11 142-45 224-32 77 12 108 39 193 32 80-7 135-37 178-27 55 13 88 24 144 22v64H-20Z" fill="#3f526d" opacity="0.84" />
      </g>

      <path className="marketing-art-water" d="M0 603c230-17 361 19 570 2 257-21 411-12 638 4 147 10 253 5 392-13v404H0Z" fill="url(#cc-water)" />
      <path className="marketing-art-water-sunset" d="M0 603c230-17 361 19 570 2 257-21 411-12 638 4 147 10 253 5 392-13v404H0Z" fill="url(#cc-water-sunset)" />
      <path className="marketing-art-sun-path" d="M800 611c153-14 268-13 476 2l-93 387H867Z" fill="url(#cc-water-light)" opacity="0.58" />

      <g className="marketing-art-waves" fill="none" stroke="#bce5d7" strokeLinecap="round">
        <path d="M-90 678c203-34 333 42 534 7s348 30 550 1 348 35 699-13" />
        <path d="M-90 739c203-32 333 43 534 10s348 32 550 3 348 37 699-11" />
        <path d="M-90 809c203-30 333 45 534 13s348 35 550 6 348 39 699-8" />
        <path d="M-90 891c203-28 333 47 534 16s348 37 550 9 348 41 699-5" />
      </g>

      <g className="marketing-art-foreground">
        <path d="M0 865c152-64 302-44 447 18 128 55 262 55 391 7 150-56 293-63 430-5 113 47 223 46 332 4v111H0Z" fill="#273557" opacity="0.72" />
      </g>

      <g className="marketing-art-marker">
        <circle className="marketing-marker-glow" cx="1054" cy="681" r="70" fill="#ffe281" opacity="0.22" filter="url(#cc-sun-glow)" />
        <circle className="marketing-marker-ring marketing-marker-ring-one" cx="1054" cy="681" r="42" />
        <circle className="marketing-marker-ring marketing-marker-ring-two" cx="1054" cy="681" r="20" />
        <path d="M1054 648v66M1021 681h66" stroke="#ffe281" strokeWidth="3" />
        <circle cx="1054" cy="681" r="6" fill="#ffe281" />
      </g>
    </svg>
  );
}

function OceanDescentArtwork() {
  return (
    <svg className="marketing-ocean-descent-art" viewBox="0 0 1600 3200" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs>
        <linearGradient id="cc-depth-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#43aeb0" />
          <stop offset="0.12" stopColor="#268d9a" />
          <stop offset="0.38" stopColor="#175c78" />
          <stop offset="0.7" stopColor="#102d54" />
          <stop offset="1" stopColor="#080c20" />
        </linearGradient>
        <radialGradient id="cc-diver-glow">
          <stop offset="0" stopColor="#7ed9d2" stopOpacity="0.46" />
          <stop offset="0.48" stopColor="#35a8b1" stopOpacity="0.14" />
          <stop offset="1" stopColor="#35a8b1" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cc-angler-glow">
          <stop offset="0" stopColor="#fff2a8" stopOpacity="0.92" />
          <stop offset="1" stopColor="#fff2a8" stopOpacity="0" />
        </radialGradient>
        <filter id="cc-depth-soft-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="24" />
        </filter>
      </defs>
      <rect width="1600" height="3200" fill="url(#cc-depth-water)" />

      <g className="marketing-depth-light" fill="none" stroke="#d8f7ed" strokeLinecap="round">
        <path d="M-40-110 330 920M310-110 565 980M665-120 740 900M1035-110 950 970M1360-110 1110 905M1660-100 1325 835" strokeWidth="82" opacity="0.085" />
      </g>

      <g className="marketing-depth-bubbles" fill="none" stroke="#d7f4e9" strokeWidth="4" opacity="0.4">
        <circle cx="90" cy="178" r="14" />
        <circle cx="122" cy="116" r="8" />
        <circle cx="148" cy="62" r="5" />
        <circle cx="850" cy="360" r="8" />
        <circle cx="875" cy="305" r="13" />
        <circle cx="900" cy="245" r="6" />
        <circle cx="1375" cy="760" r="16" />
        <circle cx="1404" cy="700" r="8" />
        <circle cx="1429" cy="642" r="5" />
        <circle cx="420" cy="1090" r="11" />
        <circle cx="448" cy="1026" r="6" />
        <circle cx="470" cy="970" r="4" />
        <circle cx="1090" cy="1420" r="15" />
        <circle cx="1118" cy="1357" r="8" />
        <circle cx="1140" cy="1302" r="5" />
        <circle cx="330" cy="1940" r="13" />
        <circle cx="358" cy="1877" r="7" />
        <circle cx="378" cy="1820" r="4" />
        <circle cx="1390" cy="2360" r="11" />
        <circle cx="1416" cy="2300" r="17" />
        <circle cx="1442" cy="2238" r="6" />
        <circle cx="725" cy="2780" r="9" />
        <circle cx="752" cy="2718" r="15" />
        <circle cx="778" cy="2660" r="5" />
      </g>

      <g className="marketing-depth-fish-school">
        <image className="marketing-depth-school-surface-left" href="/marketing/silhouettes/school-right.webp" x="70" y="155" width="610" height="142" preserveAspectRatio="xMidYMid meet" />
        <image className="marketing-depth-school-surface-right" href="/marketing/silhouettes/school-left.webp" x="975" y="515" width="540" height="145" preserveAspectRatio="xMidYMid meet" />
        <image className="marketing-depth-school-mid-left" href="/marketing/silhouettes/school-right.webp" x="120" y="1820" width="450" height="108" preserveAspectRatio="xMidYMid meet" />
        <image className="marketing-depth-school-mid-right" href="/marketing/silhouettes/school-left.webp" x="1010" y="1690" width="510" height="132" preserveAspectRatio="xMidYMid meet" />
      </g>

      <g className="marketing-depth-spearfishers">
        <circle cx="360" cy="430" r="245" fill="url(#cc-diver-glow)" />
        <image className="marketing-spearfisher marketing-spearfisher-near" href="/marketing/silhouettes/spearfisher-near.webp" x="68" y="305" width="430" height="125" preserveAspectRatio="xMidYMid meet" />
        <image className="marketing-spearfisher marketing-spearfisher-far" href="/marketing/silhouettes/spearfisher-far.webp" x="146" y="443" width="350" height="108" preserveAspectRatio="xMidYMid meet" />
      </g>

      <g className="marketing-depth-wildlife">
        <image className="marketing-depth-whale" href="/marketing/silhouettes/whale.webp" x="435" y="920" width="790" height="310" preserveAspectRatio="xMidYMid meet" />
        <g className="marketing-depth-squid-pair">
          <image href="/marketing/silhouettes/squid-upper.webp" x="340" y="1490" width="370" height="175" preserveAspectRatio="xMidYMid meet" />
          <image href="/marketing/silhouettes/squid-lower.webp" x="830" y="1650" width="345" height="160" preserveAspectRatio="xMidYMid meet" />
        </g>
      </g>

      <g className="marketing-depth-angler-pair">
        <g className="marketing-depth-angler marketing-depth-angler-one">
          <circle cx="515" cy="2035" r="72" fill="url(#cc-angler-glow)" filter="url(#cc-depth-soft-glow)" />
          <image href="/marketing/silhouettes/angler-left.webp" x="360" y="2010" width="205" height="148" preserveAspectRatio="xMidYMid meet" />
        </g>
        <g className="marketing-depth-angler marketing-depth-angler-two">
          <circle cx="790" cy="2187" r="62" fill="url(#cc-angler-glow)" filter="url(#cc-depth-soft-glow)" />
          <image href="/marketing/silhouettes/angler-right.webp" x="675" y="2145" width="180" height="132" preserveAspectRatio="xMidYMid meet" />
        </g>
      </g>

      <g className="marketing-depth-cliff">
        <path d="M1600 2220c-134 20-206 81-252 176-44 91-99 115-173 153-78 41-109 110-125 206-23 138-82 226-175 300h725Z" fill="#12192c" stroke="#594958" strokeWidth="9" />
        <path d="M1600 2270c-102 31-164 85-205 167-37 73-94 110-164 140-73 31-109 96-132 184" fill="none" stroke="#765a5a" strokeWidth="8" opacity="0.58" />
        <path d="M1410 2388c50 2 91-8 126-29M1260 2548c50 6 89-3 119-28M1110 2760c42 7 79 2 109-17" fill="none" stroke="#8b675d" strokeWidth="6" opacity="0.42" />
        <image className="marketing-depth-cliff-seaweed" href="/marketing/silhouettes/cliff-seaweed.webp" x="1004" y="2280" width="596" height="239" preserveAspectRatio="xMidYMid meet" />
      </g>

      <g className="marketing-depth-helmet">
        <g transform="translate(1260 2260) rotate(-11 250 205) scale(.16)">
          <ellipse cx="240" cy="388" rx="235" ry="46" fill="#0b1b35" opacity="0.38" />
          <path d="M82 318V172C82 72 153 8 250 8s168 64 168 164v146Z" fill="#5d3f35" stroke="#e0a55f" strokeWidth="18" />
          <path d="M55 318h390l-28 91H83Z" fill="#3c2d31" stroke="#c88c4e" strokeWidth="16" />
          <circle cx="250" cy="175" r="79" fill="#12233d" stroke="#d9a15f" strokeWidth="19" />
          <path d="m194 119 112 112M306 119 194 231" stroke="#a56f42" strokeWidth="17" />
          <circle cx="91" cy="210" r="45" fill="#15263e" stroke="#c88c4e" strokeWidth="16" />
          <circle cx="409" cy="210" r="45" fill="#15263e" stroke="#c88c4e" strokeWidth="16" />
          <path d="M155 31v-55h190v55M176-26h148" fill="none" stroke="#c88c4e" strokeLinecap="round" strokeWidth="18" />
          <circle cx="166" cy="365" r="14" fill="#e2aa67" />
          <circle cx="334" cy="365" r="14" fill="#e2aa67" />
          <g transform="translate(430 186)" fill="none" stroke="#d4a263" strokeLinecap="round" strokeWidth="15">
            <path d="M0 0h82v180H14Z" />
            <path d="M20 0v-38h42V0M24 52h50M24 98h50" />
          </g>
          <path d="M500 370c56 18 83 44 114 93" fill="none" stroke="#d5a062" strokeLinecap="round" strokeWidth="15" />
          <path d="m632 455 82 42-91 10Z" fill="#d5a062" opacity="0.76" />
        </g>
      </g>

      <g className="marketing-depth-seabed-approach">
        <image href="/marketing/silhouettes/seabed-full.webp" x="0" y="2936" width="1600" height="275" preserveAspectRatio="xMidYMax meet" />
      </g>
    </svg>
  );
}

const rankingFeatures = [
  ["Tide + current", "See which way the water is moving and how hard it is running."],
  ["Wind + swell", "Know when wind or surf could make a spot tough to fish."],
  ["Structure + season", "Match your target to the water it uses and the time of year."],
  ["Light + water", "Factor in daylight, water temperature, and changing weather."],
  ["Fresh reports", "See how recently conditions were checked before you head out."],
  ["Access + fishability", "Favor places you can reach and fish during your available window."],
] as const;

function SeafloorArtwork() {
  return (
    <svg className="marketing-seafloor-art" viewBox="0 0 1600 1200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="cc-seafloor-depth" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#080c20" />
          <stop offset="0.38" stopColor="#080a1d" />
          <stop offset="0.72" stopColor="#070918" />
          <stop offset="1" stopColor="#060714" />
        </linearGradient>
        <linearGradient id="cc-seafloor-sand" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9c8067" />
          <stop offset="0.52" stopColor="#695449" />
          <stop offset="1" stopColor="#3b3236" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1200" fill="url(#cc-seafloor-depth)" />

      <g className="marketing-seafloor-particles" fill="#bcecdf" opacity="0.24">
        <circle cx="116" cy="124" r="5" />
        <circle cx="238" cy="294" r="7" />
        <circle cx="447" cy="186" r="4" />
        <circle cx="635" cy="352" r="6" />
        <circle cx="814" cy="140" r="5" />
        <circle cx="1038" cy="320" r="4" />
        <circle cx="1240" cy="192" r="7" />
        <circle cx="1456" cy="290" r="5" />
        <circle cx="1386" cy="438" r="4" />
        <circle cx="330" cy="476" r="5" />
      </g>

      <path d="M0 858c112-47 244-59 362-31 151 36 275 29 408-17 127-44 256-43 385 3 134 48 282 53 445 9v378H0Z" fill="url(#cc-seafloor-sand)" />
      <path d="M0 1050c172-37 310-26 438 13 119 36 242 31 374-11 130-41 245-36 361-4 120 34 263 32 427-8v160H0Z" fill="#3d3336" opacity="0.78" />

      <g className="marketing-seafloor-life">
        <image href="/marketing/silhouettes/seabed-full.webp" x="0" y="784" width="1600" height="275" preserveAspectRatio="xMidYMax meet" />
      </g>

      <g className="marketing-seafloor-crab marketing-seafloor-crab-a">
        <g transform="translate(0 1090) scale(.52)" fill="#e47862">
          <path d="M-34-20h68v12h12v28H34v13h-68V20h-12V-8h12Z" />
          <rect x="-23" y="-31" width="12" height="12" />
          <rect x="11" y="-31" width="12" height="12" />
          <rect x="-54" y="-19" width="16" height="10" />
          <rect x="38" y="-19" width="16" height="10" />
          <path d="M-44 10h-20v12h-16M44 10h20v12h16M-35 25h-18v14h-16M35 25h18v14h16" fill="none" stroke="#e47862" strokeWidth="8" />
          <rect x="-20" y="-16" width="8" height="8" fill="#101326" />
          <rect x="12" y="-16" width="8" height="8" fill="#101326" />
        </g>
      </g>
      <g className="marketing-seafloor-crab marketing-seafloor-crab-b">
        <g transform="translate(0 1140) scale(-.46 .46)" fill="#d98a67">
          <path d="M-34-20h68v12h12v28H34v13h-68V20h-12V-8h12Z" />
          <rect x="-23" y="-31" width="12" height="12" />
          <rect x="11" y="-31" width="12" height="12" />
          <rect x="-54" y="-19" width="16" height="10" />
          <rect x="38" y="-19" width="16" height="10" />
          <path d="M-44 10h-20v12h-16M44 10h20v12h16M-35 25h-18v14h-16M35 25h18v14h16" fill="none" stroke="#d98a67" strokeWidth="8" />
          <rect x="-20" y="-16" width="8" height="8" fill="#101326" />
          <rect x="12" y="-16" width="8" height="8" fill="#101326" />
        </g>
      </g>
    </svg>
  );
}

export function MarketingHome() {
  const rootRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const revealRef = useRef<HTMLElement>(null);
  const proofRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const hero = heroRef.current;
    const reveal = revealRef.current;
    const proof = proofRef.current;
    if (!root || !hero || !reveal || !proof) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const setSunOrbit = (progress: number) => {
      const startAngle = (-62 * Math.PI) / 180;
      const angle = ((-62 + 72 * progress) * Math.PI) / 180;
      const radius = 270;
      const horizontalScale = window.innerWidth <= 760 ? 0.52 : 1;
      const x = radius * (Math.cos(angle) - Math.cos(startAngle)) * horizontalScale;
      const y = radius * (Math.sin(angle) - Math.sin(startAngle));

      root.style.setProperty("--marketing-sun-orbit-x", `${x.toFixed(2)}px`);
      root.style.setProperty("--marketing-sun-orbit-y", `${y.toFixed(2)}px`);
      root.style.setProperty("--marketing-sun-progress", progress.toFixed(4));
    };

    const update = () => {
      frame = 0;
      const heroRect = hero.getBoundingClientRect();
      const heroTravel = Math.max(hero.offsetHeight - window.innerHeight, 1);
      const heroProgress = Math.min(1, Math.max(0, -heroRect.top / heroTravel));
      const surfaceProgress = Math.min(1, Math.max(0, (heroProgress - 0.7) / 0.3));

      const revealRect = reveal.getBoundingClientRect();
      const revealTravel = Math.max(reveal.offsetHeight - window.innerHeight, 1);
      const washProgress = Math.min(1, Math.max(0, -revealRect.top / revealTravel));

      root.style.setProperty("--marketing-hero-progress", heroProgress.toFixed(4));
      root.style.setProperty("--marketing-surface-progress", surfaceProgress.toFixed(4));
      root.style.setProperty("--marketing-wash-progress", washProgress.toFixed(4));
      root.classList.toggle("marketing-hero-passed", heroProgress >= 0.995);
      setSunOrbit(heroProgress);
    };

    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    const spearfisherObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        root.classList.add("marketing-spearfishers-visible");
        spearfisherObserver.unobserve(reveal);
      },
      { rootMargin: "0px 0px -18% 0px", threshold: 0.01 },
    );
    const seafloorObserver = new IntersectionObserver(
      ([entry]) => {
        root.classList.toggle("marketing-seafloor-visible", Boolean(entry?.isIntersecting));
      },
      { rootMargin: "12% 0px 12% 0px", threshold: 0.01 },
    );

    const handleMotionPreference = () => {
      if (reducedMotion.matches) {
        root.classList.add("marketing-spearfishers-visible", "marketing-seafloor-visible");
      }
      requestUpdate();
    };

    spearfisherObserver.observe(reveal);
    seafloorObserver.observe(proof);
    handleMotionPreference();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    reducedMotion.addEventListener("change", handleMotionPreference);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      spearfisherObserver.disconnect();
      seafloorObserver.disconnect();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      reducedMotion.removeEventListener("change", handleMotionPreference);
    };
  }, []);

  return (
    <main className="marketing-home" ref={rootRef}>
      <a className="skip-link marketing-skip-link" href="#product">
        Skip to product overview
      </a>

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
            <p className="marketing-kicker">
              <span /> California coast · planning beta
            </p>
            <h1 id="marketing-title">
              Give every cast
              <br />a compass.
            </h1>
            <p>Pick your target, compare public shore and pier windows, and see which conditions line up before you make the drive.</p>
            <div className="marketing-hero-actions">
              <Link className="marketing-action marketing-action-primary" href="/forecast">
                Open web planner
                <ArrowUpRightIcon />
              </Link>
              <button className="marketing-action marketing-action-testflight" type="button" aria-disabled="true" aria-label="TestFlight download — coming soon" title="TestFlight beta is not available yet">
                <span className="marketing-testflight-wordmark" aria-hidden="true">
                  TestFlight
                </span>
                <span className="marketing-testflight-status" aria-hidden="true">
                  Coming soon
                </span>
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
          <div className="marketing-ocean-descent" aria-hidden="true">
            <OceanDescentArtwork />
            <div className="marketing-depth-vignette" />
          </div>
          <div className="marketing-depth-meter" aria-hidden="true">
            <i />
          </div>
          <div className="marketing-wash-surface" id="product">
            <div className="marketing-product">
              <header>
                <p className="marketing-light-kicker">Below the surface</p>
                <h2>
                  Read every
                  <br />
                  signal together.
                </h2>
                <p>Pick a fish, then compare the conditions that matter before you head out. CastingCompass ranks the public spots and times in your plan—it can help you choose a window, but it cannot promise a bite.</p>
              </header>
              <div className="marketing-model-panel">
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

      <section className="marketing-proof" ref={proofRef} aria-labelledby="marketing-proof-title">
        <SeafloorArtwork />
        <div className="marketing-proof-intro">
          <p className="marketing-kicker">
            <span /> At the seafloor
          </p>
          <h2 id="marketing-proof-title">
            Know the water.
            <br />
            Pick your window.
          </h2>
        </div>
        <div className="marketing-proof-grid">
          <article>
            <span>01</span>
            <h3>Pick your target</h3>
            <p>Choose halibut, striped bass, surfperch, or jacksmelt. The whole plan updates around that fish.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Know what is fresh</h3>
            <p>See when conditions were last checked, so you can judge the plan before leaving home.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Hear from the shoreline</h3>
            <p>Read public notes from anglers without exposing anyone&apos;s private or exact fishing spot.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Compare—do not gamble</h3>
            <p>Use the rank to choose between today&apos;s options. It is guidance for the plan, never a promised catch.</p>
          </article>
        </div>
        <div className="marketing-seafloor-cta">
          <span>From surface to seafloor.</span>
          <h3>
            See the whole
            <br />
            water column.
          </h3>
          <p>Choose a target, compare the public options, and carry an honest plan back to the shore.</p>
          <Link className="marketing-action marketing-action-primary" href="/forecast">
            Open CastingCompass
            <ArrowUpRightIcon />
          </Link>
        </div>
      </section>

      <footer className="marketing-footer">
        <Link className="marketing-brand" href="/" aria-label="CastingCompass home">
          <span className="marketing-brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
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
