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
        <linearGradient id="cc-depth-sand" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#a47b5c" />
          <stop offset="0.55" stopColor="#735848" />
          <stop offset="1" stopColor="#3f3437" />
        </linearGradient>
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
        <circle cx="755" cy="590" r="340" fill="url(#cc-diver-glow)" />
        <image
          href="/marketing/spearfishers-pair.webp"
          x="175"
          y="330"
          width="1080"
          height="540"
          preserveAspectRatio="xMidYMid meet"
        />
      </g>

      <g className="marketing-depth-wildlife" fill="#0c2441" stroke="#76bfb3" strokeLinejoin="round">
        <g className="marketing-depth-ray" transform="translate(980 1420) rotate(-7)">
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
        <path
          d="M0 2990c210-58 363 35 576-3 212-37 377 35 569-1 151-29 289-20 455 24v190H0Z"
          fill="url(#cc-depth-sand)"
        />
        <path
          d="M0 3092c197-32 361 24 548-5 226-34 394 22 584-2 178-23 311-12 468 27v88H0Z"
          fill="#3a3033"
          opacity="0.82"
        />
        <g fill="#4e3e3c" stroke="#b17f5b" strokeLinejoin="round" strokeWidth="8">
          <path d="m195 3036 42-104 68-3 50 107Z" />
          <ellipse cx="270" cy="2932" rx="35" ry="12" fill="#171829" />
          <path d="m665 3074 30-77 53-2 38 79Z" />
          <ellipse cx="722" cy="2997" rx="27" ry="10" fill="#171829" />
          <path d="m1190 3048 48-122 78 2 54 120Z" />
          <ellipse cx="1279" cy="2928" rx="40" ry="13" fill="#171829" />
        </g>
        <g fill="none" stroke="#8fc8b5" strokeLinecap="round" opacity="0.38">
          <path d="M270 2915c-34-54 28-72-4-131" strokeWidth="15" />
          <path d="M1279 2911c40-61-30-82 8-146" strokeWidth="17" />
          <path d="M722 2982c-23-40 18-55-5-93" strokeWidth="10" />
        </g>
        <g fill="#d4c095" opacity="0.68">
          <circle cx="285" cy="2800" r="8" /><circle cx="253" cy="2752" r="5" />
          <circle cx="1264" cy="2779" r="7" /><circle cx="1295" cy="2724" r="5" />
          <circle cx="707" cy="2912" r="5" />
        </g>
        <g fill="none" stroke="#6cae96" strokeLinecap="round" strokeWidth="11" opacity="0.54">
          <path d="M90 3120c-3-70 34-87 22-143M105 3056c-32-28-36-56-21-82" />
          <path d="M1500 3135c8-76-29-91-14-151M1492 3068c35-27 42-52 29-81" />
        </g>
        <g className="marketing-depth-crabs" fill="#db8a68" opacity="0.76">
          <path d="M467 3098c22-24 64-24 86 0l-13 30h-60Zm-1 6-27-18m31 32-31 13m116-27 27-18m-31 32 31 13" stroke="#db8a68" strokeLinecap="round" strokeWidth="9" />
          <circle cx="489" cy="3095" r="4" fill="#15182a" /><circle cx="532" cy="3095" r="4" fill="#15182a" />
        </g>
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
          <stop offset="0" stopColor="#080c20" />
          <stop offset="0.48" stopColor="#0a1230" />
          <stop offset="1" stopColor="#12142a" />
        </linearGradient>
        <linearGradient id="cc-seafloor-sand" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#aa8464" />
          <stop offset="0.6" stopColor="#72584b" />
          <stop offset="1" stopColor="#44383a" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1100" fill="url(#cc-seafloor-depth)" />
      <g fill="#bcecdf" opacity="0.24">
        <circle cx="173" cy="145" r="7" /><circle cx="441" cy="269" r="5" />
        <circle cx="784" cy="126" r="6" /><circle cx="1285" cy="221" r="8" />
        <circle cx="1444" cy="129" r="4" /><circle cx="1040" cy="365" r="5" />
      </g>
      <g className="marketing-seafloor-smoke" fill="none" strokeLinecap="round">
        <path d="M312 715c-34-58 31-86-5-151" stroke="#71bcb1" strokeWidth="18" opacity="0.19" />
        <path d="M832 787c25-46-22-67 4-116" stroke="#d5f0d7" strokeWidth="12" opacity="0.14" />
        <path d="M1278 728c34-61-29-86 8-153" stroke="#78c0b3" strokeWidth="18" opacity="0.18" />
      </g>
      <g fill="#d9c89f" opacity="0.44">
        <circle cx="307" cy="551" r="7" /><circle cx="328" cy="514" r="4" />
        <circle cx="1280" cy="560" r="7" /><circle cx="1260" cy="521" r="4" />
        <circle cx="833" cy="656" r="5" />
      </g>
      <path
        d="M0 748c188-63 349 22 540-7 220-33 370 23 564-5 186-28 326-17 496 33v331H0Z"
        fill="url(#cc-seafloor-sand)"
      />
      <path
        d="M0 938c193-35 352 24 547-4 216-31 371 20 558-4 182-24 328-12 495 32v138H0Z"
        fill="#3d3336"
        opacity="0.72"
      />
      <g className="marketing-seafloor-vents" fill="#4a3a3a" stroke="#b17e5d" strokeLinejoin="round" strokeWidth="8">
        <path d="m250 790 25-75 70-1 36 76Z" />
        <ellipse cx="312" cy="715" rx="30" ry="9" fill="#171728" />
        <path d="m790 842 18-55 48-1 25 56Z" />
        <ellipse cx="833" cy="787" rx="24" ry="8" fill="#171728" />
        <path d="m1205 811 28-84 70 1 37 83Z" />
        <ellipse cx="1270" cy="728" rx="32" ry="10" fill="#171728" />
      </g>
      <g className="marketing-seafloor-life" fill="none" stroke="#6eb09a" strokeLinecap="round">
        <path d="M93 919c-5-72 35-92 19-151M107 852c-34-27-39-55-24-86M139 930c10-65-24-81-8-135" strokeWidth="12" />
        <path d="M1454 950c-6-82 31-102 16-174M1472 871c34-34 39-65 24-98M1511 958c13-70-20-89-2-149" strokeWidth="12" />
        <path d="M598 960c-4-55 23-73 13-119M611 899c-24-21-28-44-17-67" strokeWidth="9" />
      </g>
      <g className="marketing-seafloor-crabs" fill="#de8b69" stroke="#de8b69" strokeLinecap="round">
        <path d="M470 914c21-24 63-24 84 0l-12 29h-60Zm-2 4-26-18m30 31-29 13m112-26 26-18m-30 31 29 13" strokeWidth="9" />
        <circle cx="491" cy="911" r="4" fill="#171728" stroke="none" /><circle cx="533" cy="911" r="4" fill="#171728" stroke="none" />
        <path d="M1015 1002c17-19 50-19 67 0l-10 23h-47Zm-1 3-21-14m24 24-23 10m89-20 21-14m-24 24 23 10" strokeWidth="7" />
      </g>
      <g fill="#91d7c7" opacity="0.62">
        <path d="m924 307 40-17 42 17-42 19Zm-5 0-24-18v36Z" />
        <path d="m1070 394 30-13 32 13-32 14Zm-4 0-18-14v28Z" />
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
              Pick your target, compare public shore and pier windows, and see which
              conditions line up before you make the drive.
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
          <div className="marketing-depth-meter" aria-hidden="true"><i /></div>
          <div className="marketing-wash-surface" id="product">
            <div className="marketing-product">
              <header>
                <p className="marketing-light-kicker">Below the surface</p>
                <h2>Read every<br />signal together.</h2>
                <p>
                  Pick a fish, then compare the conditions that matter before you head out.
                  CastingCompass ranks the public spots and times in your plan—it can help
                  you choose a window, but it cannot promise a bite.
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
          <h2 id="marketing-proof-title">Know the water.<br />Pick your window.</h2>
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
