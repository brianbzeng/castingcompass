import type { Metadata } from "next";
import { LEGAL_SUPPORT_EMAIL, LegalPage, LegalSection } from "../components/LegalPage";

const PAGE_URL = "https://castingcompass.com/terms";
const PAGE_TITLE = "Terms of Service · CastingCompass";
const PAGE_DESCRIPTION = "Terms governing use of the CastingCompass fishing opportunity planner and account features.";

export const metadata: Metadata = {
  title: "Terms of Service",
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

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal · Terms"
      title="Terms of Service"
      summary="These Terms of Service govern your access to and use of CastingCompass, including its website, forecasts, account features, saved locations, and trip-reporting tools."
    >
      <LegalSection title="1. Eligibility and agreement">
        <p>You must be at least 13 years old to create or use a CastingCompass account. By accessing the service, creating an account, or using an account feature, you agree to these Terms and acknowledge the Privacy Policy. If you do not agree, do not use the service or submit information.</p>
        <p>The public forecast may be viewed without an account. Additional eligibility requirements may apply to particular features. You may use the service only in compliance with applicable law and these Terms.</p>
      </LegalSection>

      <LegalSection title="2. What the forecast means">
        <p>CastingCompass ranks currently evaluated locations and time windows for one selected planning target: California halibut, striped bass, surfperch, or jacksmelt. Surfperch is a family-level planning profile rather than a claim about every member species. An Opportunity Score is a relative percentile within the current comparison set. A score of 80 means the option ranks ahead of about 80% of the options being compared. It does not mean an 80% chance of catching a fish.</p>
        <p>Scores combine public environmental data, site and habitat information, seasonality, practical fishability adjustments, and experimental model outputs. Inputs can be missing, delayed, estimated, stale, imprecise, or wrong. Fish behavior and fishing results are uncertain. No score, explanation, map, chart, message, or discussion post guarantees that fish are present or that a location is accessible, safe, legal, or fishable.</p>
        <p>A separate official water-quality advisory overlay may suppress an exactly mapped site from recommendations. A no-posting result does not improve its score or mean water contact or seafood consumption is safe. Missing, stale, unmonitored, unavailable, or unmapped status remains unknown.</p>
      </LegalSection>

      <LegalSection title="3. Safety, navigation, access, and regulations">
        <p>CastingCompass is for informational and recreational planning only. It is not navigational data, a chart, a weather warning service, legal advice, medical advice, emergency guidance, or a substitute for your judgment. Do not use it to make decisions where an error could cause injury, death, property damage, trespass, or a regulatory violation.</p>
        <p>Before and during every trip, you are responsible for checking official weather and marine forecasts, tides, swell, surf, currents, water quality, closures, access rules, property boundaries, licensing requirements, species identification, size limits, bag limits, gear restrictions, and all other current regulations. Conditions can change faster than the service updates. Leave or do not enter when conditions are unsafe. Call 911 or the appropriate emergency authority in an emergency.</p>
        <p>Respect wildlife, habitat, other anglers, private property, and posted rules. Pack out line and trash. Species rules can change; always confirm current California Department of Fish and Wildlife rules rather than relying on a number displayed by CastingCompass.</p>
      </LegalSection>

      <LegalSection title="4. Accounts and security">
        <p>You must provide accurate account information, maintain the confidentiality of your credentials, and promptly notify us if you suspect unauthorized access. You are responsible for activity conducted through your account. Email verification confirms control of an address but does not independently verify identity.</p>
        <p>You may download your account records or permanently delete your account from the Profile page. An accepted deletion request immediately removes account access, saved locations, gear presets, linked trip reports, and linked public discussion summaries from the active database. Stored trip-photo objects may require background cleanup; a secure deletion receipt reports whether that cleanup is completed, processing, or needs operator attention. Limited backup copies, security logs, pseudonymous deletion records, and information required by law may remain for their stated operational or legal retention periods.</p>
        <p>We may restrict, suspend, or terminate an account when reasonably necessary to protect the service or its users, investigate suspected misconduct, comply with law, or enforce these Terms.</p>
      </LegalSection>

      <LegalSection title="5. Trip reports, photos, and community content">
        <p>You retain ownership of content you submit. You grant CastingCompass a worldwide, non-exclusive, royalty-free license to host, store, reproduce, transform, analyze, and use that content as reasonably necessary to operate, secure, evaluate, research, and improve the service and its forecasting systems. This license continues while the content is retained and includes creating de-identified or aggregated information and, after human approval, pseudonymous public summaries.</p>
        <p>You represent that you have all rights and permissions necessary to submit the content and that it does not violate any law or another person&apos;s privacy, intellectual-property, publicity, safety, or other rights. Do not submit private contact information, exact sensitive habitat locations, images of people without permission, unlawful material, abusive content, or intentionally false or misleading reports.</p>
        <p>Trip notes may be automatically reviewed for privacy, safety, relevance, and usefulness. Automated review may prepare a shortened pseudonymous draft, but it cannot publish or approve that draft. A human moderator must approve a draft before it can appear on a location discussion page. Automated and human review can make mistakes, and we may edit, withhold, or remove content.</p>
        <p>Place communities are publicly readable only through a limited preview; signing in is required to continue or participate. Community members use pseudonymous handles and may edit or delete their own submissions, report content, and block another handle. Posts and comments enter a moderation queue before public publication. Do not attempt to identify another user, evade a block or rate limit, manipulate moderation, or publish coordinates, addresses, access codes, or other details that could expose a private or sensitive location.</p>
        <p>Community content is user-generated and may be inaccurate, outdated, unsafe, or objectionable. CastingCompass may review, reject, limit, remove, or preserve content and related records when reasonably necessary to operate moderation, protect users, investigate abuse, or comply with law. These product terms and controls still require independent legal and UGC-policy review before launch; they are not legal advice.</p>
      </LegalSection>

      <LegalSection title="6. Automated systems and acceptable use">
        <p>CastingCompass uses automated rules and models to rank fishing options, and an external AI service may standardize gear information and prepare a possible discussion draft. Automated review cannot publish the draft; human approval is required. The live score is a hybrid planning and relative-ranking model, not a catch probability or a deployed, fully trained catch-prediction model. See the AI and Forecast Disclosure for additional information.</p>
        <p>You may not misuse the service or submit content, instructions, or data intended to disrupt, manipulate, test, or circumvent its operation or safeguards. Prohibited conduct includes unauthorized automated access, security testing without prior written authorization, scraping, reverse engineering, interference with other users, excessive requests, extraction of non-public information, or submission of deceptive, unlawful, dangerous, abusive, or privacy-invasive material.</p>
        <p>We may reject or remove prohibited submissions and may suspend or permanently delete accounts involved in attempted interference, abuse, or circumvention of the service.</p>
      </LegalSection>

      <LegalSection title="7. Third-party services and links">
        <p>The service relies on or links to external infrastructure, communications, security, automated-processing, mapping, public-agency, weather, marine, and fisheries services. Their information, availability, terms, and privacy practices are outside our control. A link, integration, or data source does not constitute an endorsement. Your use of an external service is governed by that service&apos;s terms and policies.</p>
      </LegalSection>

      <LegalSection title="8. No warranties">
        <p>To the maximum extent permitted by law, CastingCompass is provided “as is” and “as available,” without warranties of accuracy, availability, fitness for a particular purpose, merchantability, non-infringement, safety, legality, or results. We do not warrant that the service will be uninterrupted, secure, error-free, or suitable for any specific trip.</p>
      </LegalSection>

      <LegalSection title="9. Limitation of liability">
        <p>To the maximum extent permitted by law, CastingCompass and its operators, affiliates, contractors, and service providers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost data, lost profits, missed catches, travel costs, property damage, personal injury, regulatory penalties, access problems, or harm arising from environmental conditions, external data or services, user content, or reliance on the service.</p>
        <p>Where liability cannot be excluded, aggregate liability arising from the service will not exceed the greater of the amount you paid CastingCompass during the 12 months before the claim or US $100. Some jurisdictions do not allow certain exclusions, so these limits apply only to the extent allowed by law. Nothing in these Terms excludes rights that cannot legally be waived.</p>
      </LegalSection>

      <LegalSection title="10. Indemnification">
        <p>To the extent permitted by law, you agree to defend, indemnify, and hold harmless CastingCompass and its operators, affiliates, contractors, and service providers from third-party claims, losses, liabilities, damages, and reasonable costs arising from your unlawful or unsafe use of the service, your submitted content, your violation of these Terms, or your violation of another person&apos;s rights.</p>
      </LegalSection>

      <LegalSection title="11. Changes, availability, and disputes">
        <p>We may modify, suspend, or discontinue all or part of the service at any time. If we make material changes to these Terms, the revised version will state its effective date, and account holders will be asked to accept it before continuing to use account features where appropriate. Forecast methods and data sources may change without advance notice when reasonably necessary to improve safety, accuracy, reliability, or operation.</p>
        <p>California law governs these Terms, without regard to conflict-of-law rules. Before filing a claim, contact us and allow 30 days to try to resolve it informally. Unless the law requires otherwise, disputes may be brought in the state or federal courts serving Alameda County, California.</p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>Questions about these Terms may be sent to <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
