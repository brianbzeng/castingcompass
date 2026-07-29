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

function OceanDescentArtwork() {
  const fish = [
    [170, 260, 0.7, -4], [250, 310, 0.5, 2], [330, 245, 0.42, -7],
    [1160, 390, 0.62, 5], [1260, 445, 0.44, -2], [1370, 370, 0.52, 8],
    [195, 770, 0.48, 4], [276, 820, 0.34, -5], [356, 742, 0.4, 1],
    [1120, 960, 0.58, -4], [1215, 1018, 0.4, 3], [1312, 930, 0.46, -7],
    [215, 1370, 0.5, 7], [305, 1435, 0.34, 0], [390, 1350, 0.42, -5],
    [1090, 1565, 0.5, -6], [1190, 1620, 0.35, 3], [1290, 1540, 0.42, 7],
    [160, 1925, 0.48, 3], [255, 1990, 0.33, -5], [350, 1880, 0.4, 8],
    [1130, 2200, 0.48, -2], [1220, 2265, 0.36, 5], [1325, 2175, 0.42, -8],
    [210, 2540, 0.46, 5], [305, 2605, 0.31, -3], [398, 2505, 0.39, 7],
    [1100, 2730, 0.43, -4], [1195, 2795, 0.32, 3], [1290, 2705, 0.38, -6],
    [620, 300, 0.34, 2], [760, 245, 0.42, -4], [920, 330, 0.3, 6],
    [650, 790, 0.35, -5], [805, 735, 0.28, 4], [960, 825, 0.4, -2],
    [615, 1385, 0.32, 5], [785, 1450, 0.42, -3], [940, 1350, 0.28, 2],
    [655, 1910, 0.36, -5], [810, 1990, 0.29, 3], [965, 1870, 0.4, 6],
    [620, 2495, 0.3, 4], [780, 2570, 0.39, -4], [930, 2470, 0.27, 1],
    [645, 2780, 0.34, -3], [805, 2715, 0.26, 5], [950, 2810, 0.37, -5],
  ] as const;

  return (
    <svg
      className="marketing-ocean-descent-art"
      viewBox="0 0 1600 3200"
      preserveAspectRatio="xMidYMin slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cc-depth-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#20385f" />
          <stop offset="0.13" stopColor="#237586" />
          <stop offset="0.38" stopColor="#174e70" />
          <stop offset="0.7" stopColor="#102a50" />
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

      <g className="marketing-depth-light" fill="none" stroke="#c9f3e3" strokeLinecap="round">
        <path d="M165-70 470 860M520-80 650 940M970-70 880 960M1420-60 1080 880" strokeWidth="54" opacity="0.07" />
      </g>

      <g className="marketing-depth-bubbles" fill="none" stroke="#d7f4e9" strokeWidth="4" opacity="0.4">
        <circle cx="215" cy="405" r="16" /><circle cx="244" cy="344" r="9" /><circle cx="1310" cy="510" r="13" />
        <circle cx="1336" cy="453" r="7" /><circle cx="1360" cy="399" r="17" /><circle cx="527" cy="1024" r="11" />
        <circle cx="551" cy="960" r="6" /><circle cx="1090" cy="1278" r="15" /><circle cx="1117" cy="1218" r="8" />
        <circle cx="330" cy="1780" r="13" /><circle cx="358" cy="1717" r="7" /><circle cx="1422" cy="1980" r="11" />
        <circle cx="1445" cy="1920" r="17" /><circle cx="730" cy="2440" r="9" /><circle cx="757" cy="2378" r="15" />
        <circle cx="842" cy="680" r="8" /><circle cx="864" cy="624" r="13" /><circle cx="885" cy="568" r="6" />
      </g>

      <g className="marketing-depth-fish-school" fill="#bfe8d9">
        {fish.map(([x, y, scale, rotation], index) => (
          <g
            key={`${x}-${y}`}
            transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}
            opacity={0.32 + ((index % 5) * 0.08)}
          >
            <path d="M0 0c36-30 91-27 132 0-41 28-96 31-132 0Zm129 0 45-35v70Z" />
            <circle cx="28" cy="-6" r="4" fill="#0f3654" />
          </g>
        ))}
      </g>

      <g className="marketing-depth-spearfishers">
        <circle cx="825" cy="505" r="300" fill="url(#cc-diver-glow)" />
        <g className="marketing-spearfisher-primary-wrap">
          <g className="marketing-spearfisher marketing-spearfisher-primary" transform="translate(365 490) rotate(-8)">
            <path d="M304 52c-54-29-121-28-181 8L82 92l53 20c58 22 126 8 178-35Z" fill="#0a1b35" />
            <circle cx="329" cy="57" r="28" fill="#0a1b35" />
            <path d="m315 42 43 4-7 19-40 3Z" fill="#69d0cb" opacity="0.72" />
            <path d="m153 93-99 52M180 99 82 173" fill="none" stroke="#0a1b35" strokeLinecap="round" strokeWidth="25" />
            <path d="m65 131-74 9 57 39ZM92 159l-68 29 68 18Z" fill="#0a1b35" />
            <path d="m280 72 73 34 62-9M352 106l94-26" fill="none" stroke="#0a1b35" strokeLinecap="round" strokeLinejoin="round" strokeWidth="18" />
            <path d="M398 91 638 64M637 64l-25-10m25 10-21 15" fill="none" stroke="#f2c678" strokeLinecap="round" strokeWidth="7" />
            <circle cx="329" cy="57" r="36" fill="none" stroke="#f2c678" strokeWidth="5" opacity="0.56" />
            <path d="M344 26c18-28 39-40 62-38" fill="none" stroke="#0a1b35" strokeLinecap="round" strokeWidth="12" />
          </g>
        </g>
        <g className="marketing-spearfisher-secondary-wrap">
          <g className="marketing-spearfisher marketing-spearfisher-secondary" transform="translate(690 855) rotate(7) scale(.62)">
            <path d="M304 52c-54-29-121-28-181 8L82 92l53 20c58 22 126 8 178-35Z" fill="#0a1b35" />
            <circle cx="329" cy="57" r="28" fill="#0a1b35" />
            <path d="m315 42 43 4-7 19-40 3Z" fill="#69d0cb" opacity="0.7" />
            <path d="m153 93-99 52M180 99 82 173" fill="none" stroke="#0a1b35" strokeLinecap="round" strokeWidth="25" />
            <path d="m65 131-74 9 57 39ZM92 159l-68 29 68 18Z" fill="#0a1b35" />
            <path d="m280 72 73 34 62-9M352 106l94-26" fill="none" stroke="#0a1b35" strokeLinecap="round" strokeWidth="18" />
            <path d="M398 91 630 64M629 64l-23-10m23 10-20 15" fill="none" stroke="#f2c678" strokeLinecap="round" strokeWidth="7" />
          </g>
        </g>
      </g>

      <g className="marketing-depth-wildlife" fill="#0c2441" stroke="#76bfb3" strokeLinejoin="round">
        <g className="marketing-depth-ray" transform="translate(980 1170) rotate(-7)">
          <path d="M0 75c84-97 202-99 298 0-75-19-119-11-149 35-30-46-76-55-149-35Z" strokeWidth="7" />
          <path d="M149 108c25 47 66 89 125 124" fill="none" strokeLinecap="round" strokeWidth="9" />
        </g>
        <g className="marketing-depth-jellies" fill="#6db9b0" opacity="0.62">
          <path d="M206 1510c0-51 38-89 89-89s89 38 89 89c-43-18-136-18-178 0Z" />
          <path d="M232 1506c-8 80 32 102 8 175M277 1508c20 72-18 111 12 177M328 1507c-7 78 29 108 5 176M363 1505c20 65-9 98 13 151" fill="none" stroke="#87d1c5" strokeLinecap="round" strokeWidth="8" />
          <path d="M1230 1820c0-39 29-68 68-68s68 29 68 68c-33-14-104-14-136 0Z" />
          <path d="M1249 1817c-7 62 24 78 6 133M1284 1818c15 55-13 85 9 135M1323 1817c-5 60 22 83 4 135" fill="none" stroke="#87d1c5" strokeLinecap="round" strokeWidth="7" />
          <path d="M710 1640c0-35 26-61 61-61s61 26 61 61c-30-12-93-12-122 0Z" />
          <path d="M726 1638c-5 55 22 72 6 121M758 1638c14 51-12 79 8 123M793 1638c-5 55 20 76 4 122" fill="none" stroke="#87d1c5" strokeLinecap="round" strokeWidth="6" />
        </g>
      </g>

      <g className="marketing-depth-helmet">
        <g transform="translate(260 1315) scale(.28)">
          <ellipse cx="240" cy="388" rx="235" ry="46" fill="#0b1b35" opacity="0.38" />
          <path d="M82 318V172C82 72 153 8 250 8s168 64 168 164v146Z" fill="#5d3f35" stroke="#e0a55f" strokeWidth="18" />
          <path d="M55 318h390l-28 91H83Z" fill="#3c2d31" stroke="#c88c4e" strokeWidth="16" />
          <circle cx="250" cy="175" r="79" fill="#12233d" stroke="#d9a15f" strokeWidth="19" />
          <path d="m194 119 112 112M306 119 194 231" stroke="#a56f42" strokeWidth="17" />
          <circle cx="91" cy="210" r="45" fill="#15263e" stroke="#c88c4e" strokeWidth="16" />
          <circle cx="409" cy="210" r="45" fill="#15263e" stroke="#c88c4e" strokeWidth="16" />
          <path d="M155 31v-55h190v55M176-26h148" fill="none" stroke="#c88c4e" strokeLinecap="round" strokeWidth="18" />
          <circle cx="166" cy="365" r="14" fill="#e2aa67" /><circle cx="334" cy="365" r="14" fill="#e2aa67" />
          <g transform="translate(430 186)" fill="none" stroke="#d4a263" strokeLinecap="round" strokeWidth="15">
            <path d="M0 0h82v180H14Z" />
            <path d="M20 0v-38h42V0M24 52h50M24 98h50" />
          </g>
          <path d="M500 370c56 18 83 44 114 93" fill="none" stroke="#d5a062" strokeLinecap="round" strokeWidth="15" />
          <path d="m632 455 82 42-91 10Z" fill="#d5a062" opacity="0.76" />
        </g>
      </g>

      <g className="marketing-depth-angler">
        <g transform="translate(1110 2100) scale(.28)">
          <circle cx="386" cy="-34" r="108" fill="url(#cc-angler-glow)" filter="url(#cc-depth-soft-glow)" />
          <path d="M34 160c103-150 326-177 468-41 85 82 55 207-73 250-154 51-333 11-417-87-38-44-29-81 22-122Z" fill="#17213a" stroke="#7bb8ad" strokeWidth="9" />
          <path d="m13 207-104-75 35 116-51 97 123-41" fill="#17213a" stroke="#7bb8ad" strokeLinejoin="round" strokeWidth="9" />
          <path d="M282 62c0-85 38-131 104-131" fill="none" stroke="#8ac6b8" strokeLinecap="round" strokeWidth="11" />
          <circle cx="392" cy="-68" r="24" fill="#fff09c" />
          <circle cx="392" cy="-68" r="51" fill="none" stroke="#fff09c" strokeWidth="5" opacity="0.55" />
          <circle cx="374" cy="176" r="18" fill="#fff09c" />
          <path d="M383 257c-88 59-183 66-272 20 83-1 173-8 272-20Z" fill="#080d21" stroke="#dce8d1" strokeWidth="6" />
          <path d="m157 276 22 33 19-39 25 34 17-41 27 31 14-42" fill="#fff4d0" />
        </g>
      </g>

      <g className="marketing-depth-volcanic-field">
        <path d="M0 3005c124-72 220-53 340 3 120 56 222 44 350-14 155-70 283-70 421 0 139 70 272 81 489-12v218H0Z" fill="#0a0b18" />
        <path d="M45 3064 238 2742l193 322ZM404 3092l146-254 149 254ZM1020 3074l204-347 212 347Z" fill="#18152b" stroke="#6f3d51" strokeWidth="9" />
        <path d="m179 2850 59-108 62 110-35 33h-54Z" fill="#e4615d" opacity="0.7" />
        <path d="m1166 2828 58-101 61 105-34 29h-55Z" fill="#e4615d" opacity="0.78" />
        <g fill="none" stroke="#efa46d" strokeLinecap="round" opacity="0.58">
          <path d="M240 2780c-45-89 31-123-7-211" strokeWidth="19" />
          <path d="M1222 2765c46-98-34-129 16-224" strokeWidth="21" />
          <path d="M565 2880c-29-68 25-92-7-157" strokeWidth="13" />
        </g>
      </g>
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

function CastingRodVisual() {
  return (
    <div className="marketing-cast-rod" aria-hidden="true">
      <svg viewBox="0 0 760 430" preserveAspectRatio="xMidYMid meet">
        <g className="marketing-cast-rod-body">
          <path
            className="marketing-cast-rod-blank"
            d="M155 369C205 291 256 212 322 125"
            fill="none"
            strokeLinecap="round"
            strokeWidth="13"
          />
          <path
            className="marketing-cast-rod-spine"
            d="M155 369C205 291 256 212 322 125"
            fill="none"
            strokeLinecap="round"
            strokeWidth="5"
          />
          <path
            className="marketing-cast-rod-grip"
            d="M133 401 184 329"
            fill="none"
            strokeLinecap="round"
            strokeWidth="22"
          />
          <g className="marketing-cast-rod-reel">
            <circle cx="169" cy="347" r="28" />
            <circle cx="169" cy="347" r="10" />
            <path d="m190 363 27 29" />
          </g>
          <g className="marketing-cast-rod-guides" fill="none">
            <circle cx="230" cy="253" r="7" />
            <circle cx="276" cy="187" r="6" />
            <circle cx="318" cy="130" r="5" />
          </g>
        </g>
        <path
          className="marketing-cast-line"
          d="M322 125C461 3 659 47 709 245"
          fill="none"
          strokeLinecap="round"
          strokeWidth="4"
        />
      </svg>
    </div>
  );
}

function VolcanicSeafloorArtwork() {
  return (
    <svg
      className="marketing-volcanic-seafloor-art"
      viewBox="0 0 1600 1100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cc-seafloor-depth" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#101b3f" />
          <stop offset="0.52" stopColor="#0a1230" />
          <stop offset="1" stopColor="#070817" />
        </linearGradient>
        <radialGradient id="cc-seafloor-lava">
          <stop offset="0" stopColor="#ffbf6b" stopOpacity="0.86" />
          <stop offset="0.36" stopColor="#ef655f" stopOpacity="0.46" />
          <stop offset="1" stopColor="#ef655f" stopOpacity="0" />
        </radialGradient>
        <filter id="cc-seafloor-blur" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
      </defs>
      <rect width="1600" height="1100" fill="url(#cc-seafloor-depth)" />
      <g fill="#bcecdf" opacity="0.24">
        <circle cx="173" cy="145" r="7" /><circle cx="441" cy="269" r="5" />
        <circle cx="784" cy="126" r="6" /><circle cx="1285" cy="221" r="8" />
        <circle cx="1444" cy="129" r="4" /><circle cx="1040" cy="365" r="5" />
      </g>
      <g className="marketing-seafloor-smoke" fill="none" strokeLinecap="round">
        <path d="M290 737c-78-132 72-182-10-330" stroke="#5fb5ac" strokeWidth="34" opacity="0.14" />
        <path d="M332 748c83-142-58-195 26-352" stroke="#d5f0d7" strokeWidth="23" opacity="0.12" />
        <path d="M1217 724c70-126-62-171 15-316" stroke="#69b9b2" strokeWidth="30" opacity="0.14" />
        <path d="M1253 739c-63-139 58-189-10-338" stroke="#e7dbb2" strokeWidth="19" opacity="0.1" />
      </g>
      <g className="marketing-seafloor-vents" fill="#171629" stroke="#755367" strokeLinejoin="round" strokeWidth="8">
        <path d="m232 815 37-237 69 4 44 233Z" />
        <path d="m1128 811 46-291 77 5 50 286Z" />
        <path d="m533 856 29-149 55 2 37 147Z" />
      </g>
      <g className="marketing-seafloor-glow">
        <circle cx="796" cy="846" r="230" fill="url(#cc-seafloor-lava)" filter="url(#cc-seafloor-blur)" />
        <circle cx="1408" cy="899" r="164" fill="url(#cc-seafloor-lava)" filter="url(#cc-seafloor-blur)" opacity="0.62" />
      </g>
      <path d="M0 902 231 622l202 280 335-424 329 424 221-287 282 287v198H0Z" fill="#131123" stroke="#553448" strokeWidth="10" />
      <path d="m682 587 86-109 88 113-43 31-67-1Z" fill="#ee655d" opacity="0.78" />
      <path d="m1250 703 68-88 72 92-38 27h-66Z" fill="#f08a62" opacity="0.66" />
      <path d="M0 982c213-58 376 30 576 0 229-34 371 19 549-10 154-25 296-15 475 34v94H0Z" fill="#080713" />
      <g fill="#91d7c7" opacity="0.72">
        <path d="m919 312 42-18 43 18-43 18Zm-5 0-25-19v38Z" />
        <path d="m1036 368 31-14 34 14-34 15Zm-5 0-19-15v30Z" />
      </g>
      <g className="marketing-seafloor-tube-worms" fill="none" strokeLinecap="round" strokeWidth="9">
        <path d="M103 934c-4-68 14-94 3-146M135 940c18-59 4-91 24-131M1480 953c-8-64 9-99-6-139M1511 956c21-63 12-94 32-137" stroke="#e4676a" />
        <path d="M103 790h7M157 810h7M1471 815h7M1540 820h7" stroke="#ffd185" strokeWidth="16" />
      </g>
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
    let castPlayed = false;

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
        root.classList.add("marketing-cast-ready");
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
      if (!castPlayed && washProgress >= 0.76) {
        castPlayed = true;
        root.classList.add("marketing-cast-ready");
      }
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
          <div className="marketing-ocean-descent" aria-hidden="true">
            <OceanDescentArtwork />
            <div className="marketing-depth-vignette" />
          </div>
          <div className="marketing-depth-meter" aria-hidden="true">
            <span>Surface</span>
            <i />
            <span>Abyss</span>
          </div>
          <div className="marketing-wash-surface" id="product">
            <div className="marketing-product">
              <header>
                <p className="marketing-light-kicker">Below the surface</p>
                <h2>Read every<br />signal together.</h2>
                <p>
                  CastingCompass combines current conditions with a versioned profile for
                  the selected species, then compares the available windows. It is an
                  expert-configured hybrid planning baseline—not a catch-probability engine.
                </p>
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
                <CastingRodVisual />
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
        <VolcanicSeafloorArtwork />
        <div className="marketing-proof-intro">
          <p className="marketing-kicker"><span /> At the seafloor</p>
          <h2 id="marketing-proof-title">Useful context.<br />Solid ground.</h2>
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
        <div className="marketing-seafloor-cta">
          <span>From surface to seafloor.</span>
          <h3>See the whole<br />water column.</h3>
          <p>Choose a target, compare the public options, and carry an honest plan back to the shore.</p>
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
