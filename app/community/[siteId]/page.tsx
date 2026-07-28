import type { Metadata } from "next";
import { notFound } from "next/navigation";
import sites from "../../../public/data/sites.json";
import { PlaceCommunity } from "../../components/CommunityExperience";
import type { FishingSite } from "../../types";

const fishingSites = sites as FishingSite[];

export function generateStaticParams() {
  return fishingSites.map((site) => ({ siteId: site.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteId: string }>;
}): Promise<Metadata> {
  const { siteId } = await params;
  const site = fishingSites.find((candidate) => candidate.id === siteId);
  if (!site) return {};
  const title = `${site.name} community · CastingCompass`;
  const description = `Public preview and account-gated community discussion for ${site.name}.`;
  const url = `https://castingcompass.com/community/${site.id}`;
  return {
    title: `${site.name} community`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
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
      title,
      description,
      images: [{
        url: "/og.png",
        alt: "CastingCompass — California coastal fishing planner",
      }],
    },
  };
}

export default async function PlaceCommunityPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const site = fishingSites.find((candidate) => candidate.id === siteId);
  if (!site) notFound();
  return <PlaceCommunity site={site} sites={fishingSites} />;
}
