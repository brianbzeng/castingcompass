"use client";

import type { CSSProperties, SVGProps } from "react";

const TOPOGRAPHIC_ASSET =
  "/marketing/daylight-draft/topographic-stock-blue.webp";
const WORDMARK = "CastingCompass";
const HIGH_PRIORITY_SVG_IMAGE = {
  fetchpriority: "high",
} as unknown as SVGProps<SVGImageElement>;
const WORDMARK_LETTERS = Array.from(WORDMARK, (letter, position) => ({
  id: `wordmark-letter-${position}`,
  letter,
  delay: position * 44,
}));

// These closed shapes were traced from nested ridges in the licensed source.
// The loader clears the inner contour first, then its neighboring elevation
// rings, so every opening retains the source map's irregular silhouette.
const revealRidges = [
  {
    name: "north",
    paths: [
      "M2162 273 L2220 283 L2268 340 L2268 500 L2192 570 L2069 610 L2016 601 L1959 540 L1969 432 L2026 347 L2162 273 Z",
      "M2162 122 L2310 147 L2388 216 L2407 290 L2388 507 L2361 568 L2267 635 L2078 693 L1979 687 L1910 642 L1873 578 L1876 364 L1913 287 L1970 230 L2084 147 L2162 122 Z",
      "M2152 54 L2338 85 L2416 142 L2469 284 L2450 469 L2404 574 L2331 638 L2078 721 L1967 715 L1879 658 L1845 590 L1833 411 L1851 281 L1964 141 L2060 76 L2152 54 Z",
    ],
  },
  {
    name: "east",
    paths: [
      "M4382 696 L4514 718 L4550 784 L4556 868 L4531 942 L4481 999 L4363 1039 L4272 991 L4241 815 L4286 734 L4382 696 Z",
      "M4780 375 L4860 397 L4893 479 L4741 704 L4627 1001 L4539 1079 L4416 1135 L4301 1147 L4203 1117 L4145 1022 L4081 809 L4087 735 L4136 658 L4311 527 L4539 474 L4780 375 Z",
      "M4786 252 L4888 264 L5030 326 L5084 380 L5100 448 L5016 642 L4860 752 L4819 806 L4763 1016 L4555 1175 L4410 1237 L4255 1262 L4113 1222 L4062 1143 L3976 902 L3895 778 L3920 676 L4258 425 L4518 366 L4786 252 Z",
    ],
  },
  {
    name: "midright",
    paths: [
      "M3755 1009 L3798 982 L3836 982 L3888 1023 L3915 1075 L3938 1174 L3931 1276 L3913 1325 L3875 1350 L3807 1360 L3761 1344 L3730 1318 L3705 1257 L3702 1186 L3711 1100 L3727 1051 Z",
    ],
  },
  {
    name: "lowerleft",
    paths: [
      "M2322 1887 L2334 1878 L2350 1880 L2363 1899 L2394 1964 L2394 2014 L2374 2045 L2331 2076 L2288 2097 L2262 2097 L2238 2082 L2244 2011 Z",
    ],
  },
] as const;

function smoothClosedRidge(path: string) {
  const points = Array.from(
    path.matchAll(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g),
    (match) => [Number(match[1]), Number(match[2])] as const,
  );

  if (points.length < 3) return path;

  const format = (value: number) => Number(value.toFixed(1));
  const commands = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const afterNext = points[(index + 2) % points.length];
    const controlScale = 0.125;
    const firstControl = [
      point[0] + (next[0] - previous[0]) * controlScale,
      point[1] + (next[1] - previous[1]) * controlScale,
    ];
    const secondControl = [
      next[0] - (afterNext[0] - point[0]) * controlScale,
      next[1] - (afterNext[1] - point[1]) * controlScale,
    ];

    return `C ${format(firstControl[0])} ${format(firstControl[1])} ${format(secondControl[0])} ${format(secondControl[1])} ${next[0]} ${next[1]}`;
  });

  return `M ${points[0][0]} ${points[0][1]} ${commands.join(" ")} Z`;
}

function spreadStyle(): CSSProperties {
  return {
    // Every loader summit follows the same uninterrupted reveal timeline.
    "--cc-spread-delay": "0ms",
  } as CSSProperties;
}

function letterStyle(delay: number): CSSProperties {
  return { "--cc-letter-delay": `${delay}ms` } as CSSProperties;
}

function LoaderTopographicMap({
  onRevealComplete,
}: {
  onRevealComplete?: () => void;
}) {
  return (
    <svg
      className="cc-topographic-map cc-topographic-map-loader"
      viewBox="0 0 6324 2372"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <mask
          id="cc-topo-loader-dissolve"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="6324"
          height="2372"
        >
          <rect width="6324" height="2372" fill="white" />
          <g className="cc-topo-ridge-spreads" fill="black">
            {/* Each summit is a solid mask shape. Scaling the filled contour
                keeps the opening solid at every frame; a growing SVG stroke
                creates hollow annuli once it becomes wider than the summit. */}
            {revealRidges.map((ridgeGroup, groupIndex) => (
              <path
                key={ridgeGroup.name}
                d={smoothClosedRidge(ridgeGroup.paths[0])}
                style={spreadStyle()}
                onAnimationEnd={
                  groupIndex === 0
                    ? (event) => {
                        if (event.animationName === "cc-topo-loader-spread") {
                          onRevealComplete?.();
                        }
                      }
                    : undefined
                }
              />
            ))}
          </g>
        </mask>
      </defs>
      <g className="cc-topo-loader-sheet" mask="url(#cc-topo-loader-dissolve)">
        <rect className="cc-topo-loader-ground" width="6324" height="2372" />
        <image
          {...HIGH_PRIORITY_SVG_IMAGE}
          className="cc-topo-stock-image"
          href={TOPOGRAPHIC_ASSET}
          width="6324"
          height="2372"
          preserveAspectRatio="none"
        />
      </g>
    </svg>
  );
}

function HeroTopographicMap() {
  return (
    <div className="cc-hero-satellite" aria-hidden="true">
      <img
        className="cc-hero-satellite-image"
        src="/marketing/daylight-draft/santa-barbara-satellite.jpg"
        alt=""
        loading="eager"
        decoding="async"
      />
      <div className="cc-hero-ocean-tint" />
      <div className="cc-hero-contour-water">
        <img
          className="cc-hero-etopo-bathymetry"
          src="/marketing/daylight-draft/santa-barbara-etopo-bathymetry.svg?v=20260802-smooth-2"
          alt=""
          data-coverage="full-water"
          loading="eager"
          decoding="async"
        />
      </div>
      <span className="cc-hero-map-attribution">
        Santa Barbara · Sentinel-2 / NOAA ETOPO / USGS contours
      </span>
    </div>
  );
}

export function TopographicLoader({
  onRevealComplete,
}: {
  onRevealComplete?: () => void;
}) {
  return (
    <div
      className="cc-topo-loader"
      role="status"
      aria-label="Loading CastingCompass"
    >
      <LoaderTopographicMap onRevealComplete={onRevealComplete} />
      <div className="cc-topo-loader-brand" aria-hidden="true">
        <strong>
          {WORDMARK_LETTERS.map(({ id, letter, delay }) => (
            <span key={id} style={letterStyle(delay)}>
              {letter}
            </span>
          ))}
        </strong>
      </div>
    </div>
  );
}

export function HeroTopographicArt() {
  return (
    <div
      className="cc-hero-topo"
      role="img"
      aria-label="Satellite view of Santa Barbara shoreline with smooth NOAA ETOPO bathymetric contours"
    >
      <HeroTopographicMap />
    </div>
  );
}
