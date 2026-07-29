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
  return (
    <svg
      className="marketing-ocean-descent-art"
      viewBox="0 0 1600 3200"
      preserveAspectRatio="xMidYMin slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cc-depth-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#54c7b2" />
          <stop offset="0.17" stopColor="#208799" />
          <stop offset="0.42" stopColor="#174e70" />
          <stop offset="0.7" stopColor="#102a50" />
          <stop offset="1" stopColor="#080c20" />
        </linearGradient>
        <radialGradient id="cc-angler-glow">
          <stop offset="0" stopColor="#fff2a8" stopOpacity="0.92" />
          <stop offset="1" stopColor="#fff2a8" stopOpacity="0" />
        </radialGradient>
        <filter id="cc-depth-soft-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="24" />
        </filter>
      </defs>
      <rect width="1600" height="3200" fill="url(#cc-depth-water)" />

      <g className="marketing-depth-surface">
        <path d="M0 170c180-45 313 52 510 7s337 27 542-9 330 48 548 0v180H0Z" fill="#6ed5c0" />
        <path d="M0 173c180-45 313 52 510 7s337 27 542-9 330 48 548 0" fill="none" stroke="#fff1c4" strokeLinecap="round" strokeWidth="14" />
        <path d="M-80 272c258-44 385 39 609 4s355 29 567-2 344 37 584-3" fill="none" stroke="#c5f0dc" strokeLinecap="round" strokeWidth="5" opacity="0.62" />
        <path d="M236 210 520 890M748 186 690 930M1188 210 930 970M1482 214 1110 940" fill="none" stroke="#fff3bd" strokeLinecap="round" strokeWidth="46" opacity="0.1" />
      </g>

      <g className="marketing-depth-bubbles" fill="none" stroke="#d7f4e9" strokeWidth="4" opacity="0.4">
        <circle cx="214" cy="530" r="16" /><circle cx="245" cy="467" r="9" /><circle cx="1280" cy="642" r="13" />
        <circle cx="1310" cy="584" r="7" /><circle cx="1332" cy="531" r="17" /><circle cx="532" cy="1024" r="11" />
        <circle cx="554" cy="960" r="6" /><circle cx="1090" cy="1278" r="15" /><circle cx="1117" cy="1218" r="8" />
        <circle cx="330" cy="1780" r="13" /><circle cx="358" cy="1717" r="7" /><circle cx="1422" cy="1980" r="11" />
        <circle cx="1445" cy="1920" r="17" /><circle cx="730" cy="2440" r="9" /><circle cx="757" cy="2378" r="15" />
      </g>

      <g className="marketing-depth-fish-school" fill="#d5f0dc" opacity="0.5">
        <path d="m213 710 42-18 43 18-43 18Zm-4 0-25-19v38Z" />
        <path d="m328 762 35-15 36 15-36 16Zm-4 0-21-16v32Z" />
        <path d="m448 690 29-13 32 13-32 14Zm-4 0-18-14v28Z" />
        <path d="m1165 1120 38-16 40 16-40 17Zm-4 0-23-17v34Z" />
        <path d="m1284 1182 31-14 34 14-34 15Zm-4 0-20-15v30Z" />
      </g>

      <g className="marketing-depth-spearfishers" transform="translate(610 720)" fill="#182a45" stroke="#ffd38f" strokeLinecap="round" strokeLinejoin="round">
        <g transform="rotate(-12 120 120)">
          <circle cx="96" cy="54" r="23" strokeWidth="5" />
          <path d="M83 78c-30 50-23 105 16 137l43-67-8-55Z" strokeWidth="7" />
          <path d="m102 117 98-8M198 109l136-16" fill="none" strokeWidth="6" />
          <path d="m99 211-64 89M117 213l24 103" fill="none" strokeWidth="12" />
          <path d="m35 300-44 24 52 4M141 316l-14 51 45-32" fill="none" strokeWidth="9" />
          <path d="m92 42 42 8" fill="none" strokeWidth="8" />
        </g>
        <g transform="translate(310 184) scale(.7) rotate(8 120 120)" opacity="0.72">
          <circle cx="96" cy="54" r="23" strokeWidth="5" />
          <path d="M83 78c-30 50-23 105 16 137l43-67-8-55Z" strokeWidth="7" />
          <path d="m102 117 208-19" fill="none" strokeWidth="6" />
          <path d="m99 211-64 89M117 213l24 103" fill="none" strokeWidth="12" />
          <path d="m35 300-44 24 52 4M141 316l-14 51 45-32" fill="none" strokeWidth="9" />
        </g>
      </g>

      <g className="marketing-depth-helmet" transform="translate(550 1295)">
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

      <g className="marketing-depth-angler" transform="translate(520 2120)">
        <circle cx="386" cy="-34" r="108" fill="url(#cc-angler-glow)" filter="url(#cc-depth-soft-glow)" />
        <path d="M34 160c103-150 326-177 468-41 85 82 55 207-73 250-154 51-333 11-417-87-38-44-29-81 22-122Z" fill="#17213a" stroke="#7bb8ad" strokeWidth="9" />
        <path d="m13 207-104-75 35 116-51 97 123-41" fill="#17213a" stroke="#7bb8ad" strokeLinejoin="round" strokeWidth="9" />
        <path d="M282 62c0-85 38-131 104-131" fill="none" stroke="#8ac6b8" strokeLinecap="round" strokeWidth="11" />
        <circle cx="392" cy="-68" r="24" fill="#fff09c" />
        <circle cx="392" cy="-68" r="51" fill="none" stroke="#fff09c" strokeWidth="5" opacity="0.55" />
        <circle cx="374" cy="176" r="18" fill="#fff09c" />
        <path d="M383 257c-88 59-183 66-272 20 83-1 173-8 272-20Z" fill="#080d21" stroke="#dce8d1" strokeWidth="6" />
        <path d="m157 276 22 33 19-39 25 34 17-41 27 31 14-42" fill="#fff4d0" />
        <g fill="#6aa69e">
          <circle cx="210" cy="140" r="8" /><circle cx="260" cy="111" r="6" /><circle cx="453" cy="237" r="8" />
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

function AbyssBannerArtwork() {
  return (
    <svg
      className="marketing-abyss-banner-art"
      viewBox="0 0 1600 560"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cc-abyss-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#162850" />
          <stop offset="0.66" stopColor="#0a1735" />
          <stop offset="1" stopColor="#08091a" />
        </linearGradient>
        <radialGradient id="cc-abyss-glow">
          <stop offset="0" stopColor="#ffb36f" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ef625e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="560" fill="url(#cc-abyss-water)" />
      <g fill="#ccf2e2" opacity="0.32">
        <circle cx="173" cy="112" r="5" /><circle cx="328" cy="207" r="4" />
        <circle cx="716" cy="90" r="6" /><circle cx="1168" cy="156" r="4" />
        <circle cx="1450" cy="82" r="6" /><circle cx="1341" cy="243" r="3" />
      </g>
      <circle cx="1265" cy="418" r="176" fill="url(#cc-abyss-glow)" />
      <path d="M0 467 211 307l190 160 272-228 260 228 328-286 339 286v93H0Z" fill="#131326" stroke="#58374b" strokeWidth="8" />
      <path d="m598 302 75-63 75 64-31 29-80-2Z" fill="#f06862" opacity="0.78" />
      <path d="m1182 250 79-69 81 70-39 30-82-1Z" fill="#f28c64" opacity="0.72" />
      <g fill="#17172b" stroke="#795168" strokeLinejoin="round" strokeWidth="7">
        <path d="m988 473 34-219 55 4 38 215Z" />
        <path d="m1428 486 29-171 48 3 33 168Z" />
      </g>
      <g fill="none" strokeLinecap="round">
        <path d="M1047 265c-46-72 34-101-9-174M1482 321c42-69-31-97 8-162" stroke="#84c7ba" strokeWidth="25" opacity="0.16" />
        <path d="M1049 261c-26-71 23-100-5-171M1480 318c-23-65 18-92-4-154" stroke="#e8d5a6" strokeWidth="10" opacity="0.2" />
      </g>
      <path d="M0 515c241-44 420 22 628-1 194-21 358 13 539-6 153-16 283-5 433 25v27H0Z" fill="#070815" />
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
        <div className="marketing-sunset-banner">
          <AbyssBannerArtwork />
          <div className="marketing-sunset-banner-vignette" aria-hidden="true" />
          <div className="marketing-sunset-banner-copy">
            <span>From surface to seafloor.</span>
            <h3>See the whole<br />water column.</h3>
            <p>Choose a target, compare the public options, and carry an honest plan back to the shore.</p>
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
