import type { Metadata } from "next";
import sites from "../../public/data/sites.json";
import { CommunityHub } from "../components/CommunityExperience";
import type { FishingSite } from "../types";

export const metadata: Metadata = {
  title: "Place communities",
  description: "Public previews and account-gated discussions for every supported CastingCompass fishing place.",
  alternates: { canonical: "https://castingcompass.com/community" },
  openGraph: {
    title: "Place communities · CastingCompass",
    description: "Public previews and account-gated discussions for every supported CastingCompass fishing place.",
    type: "website",
    url: "https://castingcompass.com/community",
    siteName: "CastingCompass",
    images: [{
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: "CastingCompass — California coastal fishing planner",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Place communities · CastingCompass",
    description: "Public previews and account-gated discussions for every supported CastingCompass fishing place.",
    images: [{
      url: "/og.png",
      alt: "CastingCompass — California coastal fishing planner",
    }],
  },
};

export default function CommunityPage() {
  return <CommunityHub sites={sites as FishingSite[]} />;
}
