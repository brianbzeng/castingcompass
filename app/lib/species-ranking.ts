import speciesProfilesDocument from "../../model/hybrid/species-profiles-v1.json" with { type: "json" };
import type { FishingSite, OpportunitySnapshot, OpportunityWindow } from "../types";

export const TARGET_TAXON_IDS = [
  "california-halibut",
  "striped-bass",
  "surfperch",
  "jacksmelt",
] as const;

export type TargetTaxonId = (typeof TARGET_TAXON_IDS)[number];

interface SpeciesProfile {
  display_name: string;
  short_name: string;
  scientific_name: string;
  target_kind: "species" | "family-profile";
  configuration_version: string;
  component_weights: {
    habitat: number;
    seasonality: number;
    dynamic: number;
    fishability: number;
  };
  access_adjustment_scale: number;
  habitat: {
    baseline: number;
    site_prior_weight: number;
    tag_adjustments: Record<string, number>;
    type_adjustments: Record<string, number>;
    exposure_adjustments: Record<string, number>;
  };
  seasonality_by_month: number[];
  tide_stage_adjustments: Record<string, number>;
}

const profiles = speciesProfilesDocument.profiles as Record<TargetTaxonId, SpeciesProfile>;

export const TARGET_SPECIES = TARGET_TAXON_IDS.map((taxonId) => ({
  taxonId,
  displayName: profiles[taxonId].display_name,
  shortName: profiles[taxonId].short_name,
  scientificName: profiles[taxonId].scientific_name,
  targetKind: profiles[taxonId].target_kind,
  configurationVersion: profiles[taxonId].configuration_version,
  componentWeights: profiles[taxonId].component_weights,
}));

function clampScore(value: number) {
  return Math.round(Math.max(5, Math.min(98, value)));
}

function fishabilityCap(score: number) {
  if (score < 25) return 32;
  if (score < 40) return 48;
  if (score < 55) return 66;
  if (score < 65) return 80;
  if (score < 75) return 90;
  return 100;
}

function habitatScore(profile: SpeciesProfile, site: FishingSite) {
  const sitePrior = typeof site.habitatPrior === "number" ? site.habitatPrior : 50;
  const tagAdjustment = site.structureTags.reduce(
    (total, tag) => total + (profile.habitat.tag_adjustments[tag] ?? 0),
    0,
  );
  const typeAdjustment = profile.habitat.type_adjustments[site.type] ?? 0;
  const exposure = site.castingZone?.exposure ?? "";
  const exposureAdjustment = profile.habitat.exposure_adjustments[exposure] ?? 0;
  return clampScore(
    profile.habitat.baseline
      + ((sitePrior - 50) * profile.habitat.site_prior_weight)
      + tagAdjustment
      + typeAdjustment
      + exposureAdjustment,
  );
}

function seasonalityScore(profile: SpeciesProfile, start: string) {
  const month = new Date(start).getUTCMonth();
  return clampScore(profile.seasonality_by_month[month] ?? 50);
}

function dynamicScore(profile: SpeciesProfile, window: OpportunityWindow) {
  const tideStage = window.conditions.tideStage?.toLowerCase() ?? "";
  return clampScore(window.dynamicScore + (profile.tide_stage_adjustments[tideStage] ?? 0));
}

function explanationFactors(
  profile: SpeciesProfile,
  habitat: number,
  seasonality: number,
  dynamic: number,
  fishability: number,
) {
  return [
    `${profile.display_name} habitat profile: ${habitat}/100 from public-place structure and exposure.`,
    `Broad monthly prior: ${seasonality}/100; this is configured guidance, not learned catch frequency.`,
    `Current public conditions: ${dynamic}/100 after the species profile's bounded tide adjustment.`,
    `Presentation fishability: ${fishability}/100 from wind, current, surf, and expected access pressure.`,
    "The final number is a relative planning rank for this comparison set, not catch probability.",
  ];
}

export function isTargetTaxonId(value: string | null | undefined): value is TargetTaxonId {
  return TARGET_TAXON_IDS.includes(value as TargetTaxonId);
}

export function targetSpeciesProfile(taxonId: TargetTaxonId) {
  return TARGET_SPECIES.find((species) => species.taxonId === taxonId)!;
}

export function rankSnapshotForSpecies(
  snapshot: OpportunitySnapshot,
  sites: readonly FishingSite[],
  targetTaxonId: TargetTaxonId,
): OpportunitySnapshot {
  const profile = profiles[targetTaxonId];
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const scored = snapshot.windows.flatMap((window) => {
    const site = sitesById.get(window.siteId);
    if (!site) return [];
    const habitat = habitatScore(profile, site);
    const seasonality = seasonalityScore(profile, window.start);
    const dynamic = dynamicScore(profile, window);
    const fishability = clampScore(window.fishabilityScore);
    const accessAdjustment = window.conditions.accessAdjustmentPoints ?? 0;
    const rawScore = Number((
      (profile.component_weights.habitat * habitat)
      + (profile.component_weights.seasonality * seasonality)
      + (profile.component_weights.dynamic * dynamic)
      + (profile.component_weights.fishability * fishability)
      + (accessAdjustment * profile.access_adjustment_scale)
    ).toFixed(6));
    return [{
      window,
      habitat,
      seasonality,
      dynamic,
      fishability,
      rawScore,
    }];
  });

  const sortedRawScores = scored.map((item) => item.rawScore).toSorted((a, b) => a - b);
  const denominator = Math.max(1, sortedRawScores.length - 1);
  const percentileByRawScore = new Map<number, number>();
  for (let firstIndex = 0; firstIndex < sortedRawScores.length;) {
    const rawScore = sortedRawScores[firstIndex];
    let lastIndex = firstIndex;
    while (lastIndex + 1 < sortedRawScores.length && sortedRawScores[lastIndex + 1] === rawScore) {
      lastIndex += 1;
    }
    percentileByRawScore.set(rawScore, Math.round(100 * ((firstIndex + lastIndex) / 2) / denominator));
    firstIndex = lastIndex + 1;
  }

  const modelVersion = `hybrid-${targetTaxonId}-${profile.configuration_version}`;
  return {
    ...snapshot,
    targetTaxonId,
    modelVersion,
    methodology:
      "Shared explainable hybrid ranking with a versioned target profile. It is expert-configured and untrained; no catch probability or measured predictive skill is claimed.",
    windows: scored.map((item) => ({
      ...item.window,
      targetTaxonId,
      modelVersion,
      score: Math.min(
        percentileByRawScore.get(item.rawScore) ?? 0,
        fishabilityCap(item.fishability),
      ),
      habitatScore: item.habitat,
      seasonalityScore: item.seasonality,
      dynamicScore: item.dynamic,
      fishabilityScore: item.fishability,
      explanationFactors: explanationFactors(
        profile,
        item.habitat,
        item.seasonality,
        item.dynamic,
        item.fishability,
      ),
    })),
  };
}
