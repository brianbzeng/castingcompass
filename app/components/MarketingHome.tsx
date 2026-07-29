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
  const fishSchools = [
    {
      id: "surface-left",
      className: "marketing-depth-school-surface-left",
      fish: [
        [130, 240, 0.46, -5, 1],
        [225, 285, 0.34, 3, 1],
        [310, 218, 0.38, -2, 1],
        [395, 300, 0.28, 5, 1],
        [475, 250, 0.32, -4, 1],
        [545, 326, 0.24, 2, 1],
      ],
    },
    {
      id: "surface-right",
      className: "marketing-depth-school-surface-right",
      fish: [
        [1035, 510, 0.4, 4, -1],
        [1120, 462, 0.3, -2, -1],
        [1200, 535, 0.34, 5, -1],
        [1280, 480, 0.27, -6, -1],
        [1350, 555, 0.23, 3, -1],
        [1415, 505, 0.28, -2, -1],
      ],
    },
    {
      id: "mid-left",
      className: "marketing-depth-school-mid-left",
      fish: [
        [155, 1650, 0.42, 5, 1],
        [250, 1715, 0.31, -4, 1],
        [345, 1610, 0.36, 2, 1],
        [445, 1690, 0.27, 6, 1],
        [545, 1638, 0.3, -3, 1],
        [630, 1740, 0.23, 3, 1],
      ],
    },
    {
      id: "mid-right",
      className: "marketing-depth-school-mid-right",
      fish: [
        [990, 1810, 0.36, -4, -1],
        [1080, 1750, 0.27, 3, -1],
        [1170, 1830, 0.32, -5, -1],
        [1260, 1768, 0.24, 4, -1],
        [1340, 1850, 0.29, -2, -1],
        [1420, 1798, 0.22, 5, -1],
      ],
    },
  ] as const;

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
        <path d="M120-90 430 900M470-80 630 990M1010-80 885 990M1480-70 1110 920" strokeWidth="58" opacity="0.1" />
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

      <g className="marketing-depth-fish-school" fill="#bfe8d9">
        {fishSchools.map((school) => (
          <g className={school.className} key={school.id}>
            {school.fish.map(([x, y, scale, rotation, direction], index) => (
              <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale * direction} ${scale})`} opacity={0.42 + (index % 4) * 0.1}>
                <path d="M0 0c36-30 91-27 132 0-41 28-96 31-132 0Zm129 0 45-35v70Z" />
                <circle cx="28" cy="-6" r="4" fill="#0f3654" />
              </g>
            ))}
          </g>
        ))}
      </g>

      <g className="marketing-depth-spearfishers">
        <circle cx="360" cy="475" r="250" fill="url(#cc-diver-glow)" />
        <g className="marketing-spearfisher marketing-spearfisher-near">
          <svg x="64" y="326" width="520" height="150" viewBox="0 0 960 240" preserveAspectRatio="xMidYMid meet">
            <image href="/marketing/spearfishers-pair.webp" width="960" height="480" />
          </svg>
        </g>
        <g className="marketing-spearfisher marketing-spearfisher-far">
          <svg x="142" y="474" width="410" height="126" viewBox="0 240 960 240" preserveAspectRatio="xMidYMid meet">
            <image href="/marketing/spearfishers-pair.webp" width="960" height="480" />
          </svg>
        </g>
      </g>

      <g className="marketing-depth-wildlife" fill="#0b2846" stroke="#78bfb4" strokeLinejoin="round">
        <g className="marketing-depth-whale" transform="translate(850 930) scale(.72)">
          <path d="M4 173c83-119 304-153 491-76 63 26 126 35 187 17l72-62-7 75 82 29-82 32 10 75-77-58c-87 18-163 14-229-8-64-21-103-12-145 22-52 41-113 54-190 33-88-24-140-51-112-79Z" strokeWidth="8" />
          <path d="M337 189c-24 80-75 119-153 117 44-28 73-64 87-107" strokeWidth="8" />
          <path d="M150 186c87 25 182 27 286 3M178 205c79 21 158 21 238 2" fill="none" strokeWidth="5" opacity="0.52" />
          <circle cx="80" cy="155" r="6" fill="#d6efe4" stroke="none" />
        </g>

        <g className="marketing-depth-squid-pair" fill="#0a213d" strokeWidth="7">
          <g transform="translate(440 1620) rotate(-8) scale(.82)">
            <path d="M0 89C31 18 151-10 237 53c43 31 42 77-1 105C149 214 31 169 0 89Z" />
            <path d="M55 52-44 13 5 92M53 126l-91 59 43-93" />
            <path d="M229 65c65-42 96-8 154-53M241 83c77-12 94 34 168 17M239 102c70 24 76 73 142 86M222 122c48 52 43 93 89 136M205 135c25 70 4 99 24 163" fill="none" strokeLinecap="round" />
            <circle cx="198" cy="83" r="10" fill="#d4eee2" stroke="none" />
          </g>
          <g transform="translate(890 1740) rotate(10) scale(.66)">
            <path d="M0 89C31 18 151-10 237 53c43 31 42 77-1 105C149 214 31 169 0 89Z" />
            <path d="M55 52-44 13 5 92M53 126l-91 59 43-93" />
            <path d="M229 65c65-42 96-8 154-53M241 83c77-12 94 34 168 17M239 102c70 24 76 73 142 86M222 122c48 52 43 93 89 136M205 135c25 70 4 99 24 163" fill="none" strokeLinecap="round" />
            <circle cx="198" cy="83" r="10" fill="#d4eee2" stroke="none" />
          </g>
        </g>
      </g>

      <g className="marketing-depth-angler-pair">
        <g className="marketing-depth-angler marketing-depth-angler-one" transform="translate(390 2040) scale(.31)">
          <circle cx="386" cy="-34" r="108" fill="url(#cc-angler-glow)" filter="url(#cc-depth-soft-glow)" />
          <path d="M34 160c103-150 326-177 468-41 85 82 55 207-73 250-154 51-333 11-417-87-38-44-29-81 22-122Z" fill="#111a33" stroke="#7bb8ad" strokeWidth="9" />
          <path d="m13 207-104-75 35 116-51 97 123-41" fill="#111a33" stroke="#7bb8ad" strokeLinejoin="round" strokeWidth="9" />
          <path d="M282 62c0-85 38-131 104-131" fill="none" stroke="#8ac6b8" strokeLinecap="round" strokeWidth="11" />
          <circle cx="392" cy="-68" r="24" fill="#fff09c" />
          <circle cx="374" cy="176" r="18" fill="#fff09c" />
          <path d="M383 257c-88 59-183 66-272 20 83-1 173-8 272-20Z" fill="#080d21" stroke="#dce8d1" strokeWidth="6" />
          <path d="m157 276 22 33 19-39 25 34 17-41 27 31 14-42" fill="#fff4d0" />
        </g>
        <g className="marketing-depth-angler marketing-depth-angler-two" transform="translate(795 2200) scale(.25)">
          <circle cx="386" cy="-34" r="108" fill="url(#cc-angler-glow)" filter="url(#cc-depth-soft-glow)" />
          <path d="M34 160c103-150 326-177 468-41 85 82 55 207-73 250-154 51-333 11-417-87-38-44-29-81 22-122Z" fill="#111a33" stroke="#7bb8ad" strokeWidth="9" />
          <path d="m13 207-104-75 35 116-51 97 123-41" fill="#111a33" stroke="#7bb8ad" strokeLinejoin="round" strokeWidth="9" />
          <path d="M282 62c0-85 38-131 104-131" fill="none" stroke="#8ac6b8" strokeLinecap="round" strokeWidth="11" />
          <circle cx="392" cy="-68" r="24" fill="#fff09c" />
          <circle cx="374" cy="176" r="18" fill="#fff09c" />
          <path d="M383 257c-88 59-183 66-272 20 83-1 173-8 272-20Z" fill="#080d21" stroke="#dce8d1" strokeWidth="6" />
          <path d="m157 276 22 33 19-39 25 34 17-41 27 31 14-42" fill="#fff4d0" />
        </g>
      </g>

      <g className="marketing-depth-cliff">
        <path d="M1600 2220c-134 20-206 81-252 176-44 91-99 115-173 153-78 41-109 110-125 206-23 138-82 226-175 300h725Z" fill="#12192c" stroke="#594958" strokeWidth="9" />
        <path d="M1600 2270c-102 31-164 85-205 167-37 73-94 110-164 140-73 31-109 96-132 184" fill="none" stroke="#765a5a" strokeWidth="8" opacity="0.58" />
        <path d="M1410 2388c50 2 91-8 126-29M1260 2548c50 6 89-3 119-28M1110 2760c42 7 79 2 109-17" fill="none" stroke="#8b675d" strokeWidth="6" opacity="0.42" />
        <g className="marketing-depth-cliff-seaweed" fill="none" stroke="#68aa92" strokeLinecap="round">
          <path d="M1280 2468c-2-76 34-96 17-163M1297 2394c-33-30-37-61-22-91M1335 2450c8-68-24-84-10-139" strokeWidth="11" />
          <path d="M1432 2356c-5-65 26-83 12-137M1446 2296c31-27 36-50 23-75M1482 2350c10-57-18-72-5-120" strokeWidth="9" />
        </g>
      </g>

      <g className="marketing-depth-helmet">
        <g transform="translate(1240 2250) scale(.2)">
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

      <g className="marketing-depth-volcanic-field">
        <g fill="#6f594c" opacity="0.7">
          <path d="m110 3174 43-20 49 20Z" />
          <path d="m574 3184 31-17 43 17Z" />
          <path d="m984 3172 48-24 54 24Z" />
          <path d="m1420 3192 37-20 45 20Z" />
        </g>
        <g fill="none" stroke="#65a78e" strokeLinecap="round" strokeWidth="10" opacity="0.55">
          <path d="M80 3195c-3-60 31-76 18-126M93 3139c-28-24-32-49-20-73" />
          <path d="M1510 3198c7-66-25-79-12-132M1504 3142c30-23 36-46 24-70" />
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

function VolcanicSeafloorArtwork() {
  return (
    <svg className="marketing-volcanic-seafloor-art" viewBox="0 0 1600 1200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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
        <radialGradient id="cc-vent-glow">
          <stop offset="0" stopColor="#f3a16f" stopOpacity="0.28" />
          <stop offset="1" stopColor="#f3a16f" stopOpacity="0" />
        </radialGradient>
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

      <g className="marketing-seafloor-smoke" fill="none" strokeLinecap="round">
        <path d="M284 766c-44-66 32-102-11-180-32-57 24-88-8-143" stroke="#71bcb1" strokeWidth="19" opacity="0.2" />
        <path d="M776 844c31-52-27-79 7-137 25-44-18-66 5-105" stroke="#d5f0d7" strokeWidth="13" opacity="0.15" />
        <path d="M1249 775c45-72-34-105 13-186 29-51-23-82 6-133" stroke="#78c0b3" strokeWidth="20" opacity="0.19" />
      </g>

      <g className="marketing-seafloor-bubbles" fill="none" stroke="#d9c89f" strokeWidth="4" opacity="0.46">
        <circle cx="278" cy="548" r="9" />
        <circle cx="302" cy="492" r="5" />
        <circle cx="259" cy="434" r="4" />
        <circle cx="1248" cy="554" r="8" />
        <circle cx="1275" cy="500" r="5" />
        <circle cx="1263" cy="448" r="4" />
        <circle cx="781" cy="670" r="6" />
        <circle cx="760" cy="626" r="4" />
      </g>

      <path d="M0 820c129-42 240-47 348-20 117 29 220 22 336-15 145-46 261-45 396-5 112 33 217 39 312 13 80-22 148-16 208 12v395H0Z" fill="url(#cc-seafloor-sand)" />
      <path d="M0 1040c154-28 287-23 415 15 108 32 223 27 346-10 138-41 251-39 376-7 131 34 280 33 463-2v164H0Z" fill="#3d3336" opacity="0.72" />

      <g className="marketing-seafloor-rocks" fill="#514445" stroke="#8f6c5a" strokeLinejoin="round" strokeWidth="5">
        <path d="m80 945 44-31 51 18 22 43-122 4Z" />
        <path d="m432 1000 31-24 44 9 24 35-104 4Z" />
        <path d="m964 950 42-30 52 19 17 39-122 1Z" />
        <path d="m1432 1006 35-30 50 15 23 39-119 2Z" />
      </g>

      <g className="marketing-seafloor-vents" fill="#47383a" stroke="#a9795b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8">
        <g className="marketing-seafloor-vent marketing-seafloor-vent-large" transform="translate(284 929) scale(.82) translate(-284 -929)">
          <circle cx="284" cy="768" r="128" fill="url(#cc-vent-glow)" stroke="none" />
          <path d="M132 918c34-33 73-46 110-39 47 9 76-12 117-9 48 3 86 23 119 59-99 31-256 30-346-11Z" />
          <path d="M222 883c5-47-9-91 1-134 8-37-3-82 19-112 18-25 50-28 70-5 24 28 8 73 18 109 12 42 3 87 14 136-34 18-85 21-122 6Z" />
          <path d="M344 886c-4-31 7-62 2-91-5-35 12-68 38-78 23-9 43 10 43 35 0 36-7 74 7 113-22 23-61 32-90 21Z" />
          <path d="m245 640 13-12 28-3 28 17-13 12-29 2-20-7ZM363 723l15-9 25 3 19 11-12 11-27-1-14-7Z" fill="#111426" />
          <path d="M234 709c20 9 52 9 82-3M231 777c24 12 59 10 91-2M363 798c17 10 38 10 59 1M225 842c31 12 67 10 102-3" fill="none" stroke="#7e594d" strokeWidth="6" opacity="0.76" />
        </g>
        <g className="marketing-seafloor-vent marketing-seafloor-vent-small" transform="translate(784 947) scale(.9) translate(-784 -947)">
          <path d="M674 946c34-28 68-37 103-24 38 14 78 8 119 24-52 28-166 30-222 0Z" />
          <path d="M731 927c6-34-5-68 2-99 7-28-1-64 18-84 17-18 43-15 57 5 18 25 6 57 14 85 9 30 4 58 11 89-28 17-74 20-102 4Z" />
          <path d="m754 752 16-9 24 2 15 12-12 11-25-1-13-7Z" fill="#111426" />
          <path d="M741 811c19 9 45 9 69-2M740 868c21 10 48 9 74-2" fill="none" stroke="#7e594d" strokeWidth="5" opacity="0.7" />
        </g>
        <g className="marketing-seafloor-vent marketing-seafloor-vent-tall" transform="translate(1274 946) scale(.72) translate(-1274 -946)">
          <circle cx="1249" cy="777" r="134" fill="url(#cc-vent-glow)" stroke="none" />
          <path d="M1085 926c41-36 87-52 130-39 45 14 80-9 124-3 54 7 100 28 139 62-105 31-289 27-393-20Z" />
          <path d="M1173 892c6-55-8-107 3-157 10-43-3-96 24-129 23-28 58-25 77 5 22 35 3 81 15 124 13 47 5 99 16 148-34 23-95 26-135 9Z" />
          <path d="M1304 892c-3-37 10-70 5-105-5-41 15-79 45-91 26-10 51 11 50 41-1 40-11 85 5 129-24 29-69 38-105 26Z" />
          <path d="m1201 614 18-12 32 2 26 13-14 14-33 3-21-10ZM1329 704l18-10 28 3 22 13-13 12-29 1-18-9Z" fill="#111426" />
          <path d="M1186 685c25 12 64 11 96-3M1183 758c27 14 68 13 101-2M1325 779c21 12 47 11 70-1M1175 831c35 14 80 12 116-3" fill="none" stroke="#7e594d" strokeWidth="6" opacity="0.76" />
        </g>
      </g>

      <g className="marketing-seafloor-life" fill="none" stroke="#6eb09a" strokeLinecap="round">
        <path d="M104 1030c-5-87 39-111 21-181M118 948c-39-33-45-67-27-104M153 1037c13-73-24-95-5-159" strokeWidth="12" />
        <path d="M485 1042c-4-62 27-82 14-134M499 972c-28-25-34-50-21-78M532 1046c10-58-21-73-7-121" strokeWidth="9" />
        <path d="M925 1018c-5-74 31-93 17-155M939 948c32-29 38-56 25-88M972 1026c9-64-20-80-4-134" strokeWidth="10" />
        <path d="M1455 1050c-7-93 35-117 18-198M1474 958c39-37 44-72 27-111M1517 1058c15-78-23-101-3-167" strokeWidth="13" />
      </g>

      <g className="marketing-seafloor-crab marketing-seafloor-crab-a">
        <g transform="translate(0 1080)" fill="#e47862">
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
        <g transform="translate(0 1135) scale(-.86 .86)" fill="#d98a67">
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
        <VolcanicSeafloorArtwork />
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
