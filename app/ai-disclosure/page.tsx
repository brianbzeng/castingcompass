import type { Metadata } from "next";
import validationStatus from "../../validation/public-status.json";
import { LEGAL_SUPPORT_EMAIL, LegalPage, LegalSection } from "../components/LegalPage";

const PAGE_URL = "https://castingcompass.com/ai-disclosure";
const PAGE_TITLE = "AI and Forecast Disclosure · CastingCompass";
const PAGE_DESCRIPTION =
  "How CastingCompass uses automated ranking, public forecast inputs, model research, and human-reviewed AI assistance.";

export const metadata: Metadata = {
  title: "AI and Forecast Disclosure",
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    type: "website",
    url: PAGE_URL,
    siteName: "CastingCompass",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "CastingCompass — California coastal fishing planner" }],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [{ url: "/og.png", alt: "CastingCompass — California coastal fishing planner" }],
  },
};

export default function AiDisclosurePage() {
  return (
    <LegalPage
      eyebrow="Transparency · Automated systems"
      title="AI and Forecast Disclosure"
      summary="This disclosure explains how CastingCompass uses automated ranking and limited AI-assisted review, distinguishes live product features from research, and describes the systems’ material limitations."
    >
      <LegalSection title="The live Opportunity Score">
        <p>The live Opportunity Score is produced by a hybrid planning and relative-ranking system. It combines curated habitat and access information, public seasonal data, tides, weather and marine conditions, daylight and moon context, and practical fishability adjustments. The result is expressed as a percentile among the locations and time windows currently being compared.</p>
        <p>The score is not a catch probability, a statement that the selected target is present, or a representation that a location is safe, lawful, accessible, or practical to fish. Public inputs may be delayed, incomplete, unavailable, or inaccurate. The four target profiles are expert-configured and untrained. Trip reports may inform product review, but they do not validate or train the current live score.</p>
        <p>A separately versioned water-quality advisory overlay can remove an exactly mapped site from recommendations when the official agency reports an active water-contact status. A no-posting result never increases the Opportunity Score. Missing, stale, unmonitored, unavailable, and unmapped status stays unknown, and neither the overlay nor the score establishes water-contact or seafood safety.</p>
      </LegalSection>

      <LegalSection title="Validation evidence today">
        <p>As of July 19, 2026, CastingCompass has not activated a prospective validation study. The current eligible prospective or confirmatory validation sample therefore contains <strong>{validationStatus.eligibleValidationEvidence.prospectiveOrConfirmatoryAttempts} attempts</strong>: {validationStatus.eligibleValidationEvidence.targetEncounters} eligible target encounters and {validationStatus.eligibleValidationEvidence.targetNonEncounters} eligible target non-encounters. Existing trip reports, including catches and skunks, remain product feedback or descriptive context rather than model-evaluation evidence.</p>
        <p>The live heuristic has completed <strong>{validationStatus.completedPerformanceAnalyses.preregisteredBaselineComparisons} preregistered baseline comparisons</strong> and <strong>{validationStatus.completedPerformanceAnalyses.probabilityCalibrationRuns} probability-calibration runs</strong>. No ranking-accuracy, calibrated catch-probability, or model-promotion claim is supported.</p>
        <p>The current published negative research result is separate: a geographically held-out seafloor-character probe reached macro F1 {validationStatus.knownNegativeResults[0].candidateValue} and was reliably worse than simpler classical structure summaries, so it was not promoted. That experiment measured terrain representation, not California-halibut catch ranking, and it is not evidence about the live Opportunity Score.</p>
      </LegalSection>

      <LegalSection title="Deep-learning research status">
        <p>CastingCompass maintains a research pipeline intended to evaluate whether learned underwater-terrain representations can improve future ranking systems. Research outputs are not part of the live Habitat Score unless the product expressly identifies a deployed model version and its supporting validation. CastingCompass will not claim a deep-learning accuracy improvement unless appropriate geographically separated evaluation demonstrates a reliable gain over simpler baselines.</p>
      </LegalSection>

      <LegalSection title="AI-assisted trip-note and gear review">
        <p>When a signed-in user completes or edits a trip report, an external AI service may process a limited portion of the report to standardize recognizable gear names, identify potentially inconsistent or unsafe content, and prepare a possible pseudonymous discussion draft.</p>
        <p>A queued review is authorized only after a final deletion-record check. A deletion completed before that point prevents the external request. A request already authorized or transmitted before deletion cannot be recalled, although its response cannot restore the deleted trip or publish a post. The automated system cannot publish or approve a draft. A human moderator must approve a draft before it can appear publicly.</p>
        <p>Automated review may misunderstand a note, product, or context. It does not determine legal responsibility or make decisions concerning employment, credit, health care, housing, eligibility for a public benefit, or another high-impact matter. Users may request correction or removal by contacting <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a>.</p>
      </LegalSection>

      <LegalSection title="Data sent for review">
        <p>The limited review data may include the curated site and site type, trip time, method, effort and catch counts, gear entries, observed fishability, forecast and model context, and up to 1,000 characters of notes. CastingCompass excludes the user&apos;s email address, internal account identifier, uploaded photo, and structured browser-location or coordinate fields.</p>
        <p>Free-text fields are processed as submitted and may contain information the user chooses to enter. Users should not include names, contact information, private access instructions, exact sensitive locations, or other confidential information. Submissions intended to disrupt, manipulate, or circumvent the service may be rejected and may result in account action under the Terms of Service.</p>
      </LegalSection>

      <LegalSection title="How to interpret explanations">
        <p>Component scores and explanation text describe inputs that influenced a ranking. They do not establish causation. Environmental conditions may be correlated with one another, and a highly ranked option may still result in no catch. Trip reports do not automatically change the live score or enter formal model evaluation; any future evaluative use is subject to a separate validation process.</p>
      </LegalSection>

      <LegalSection title="Transparency and changes">
        <p>CastingCompass seeks to describe automated features in a truthful, supportable, and non-misleading manner. This disclosure, the score explanation, source-freshness labels, the Privacy Policy, and the Terms of Service are intended to communicate the present uses and limitations of automated systems.</p>
        <p>We review applicable consumer-protection, privacy, and AI-transparency requirements as the service changes. We will update this disclosure before materially expanding automated processing, deploying a materially different scoring model, or introducing an automated system that makes decisions with significant effects on users.</p>
      </LegalSection>
    </LegalPage>
  );
}
