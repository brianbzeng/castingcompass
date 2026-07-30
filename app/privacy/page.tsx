import type { Metadata } from "next";
import { LEGAL_SUPPORT_EMAIL, LegalPage, LegalSection } from "../components/LegalPage";

const PAGE_URL = "https://castingcompass.com/privacy";
const PAGE_TITLE = "Privacy Policy · CastingCompass";
const PAGE_DESCRIPTION = "How CastingCompass collects, uses, shares, retains, and protects information.";

export const metadata: Metadata = {
  title: "Privacy Policy",
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

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal · Privacy"
      title="Privacy Policy"
      summary="This Privacy Policy describes how CastingCompass collects, uses, discloses, retains, and protects information when you use the website, account, community, and trip-reporting tools."
    >
      <LegalSection title="1. Information we collect">
        <ul>
          <li><strong>Account information:</strong> your email address, password hash, account timestamps, and records of your acceptance of the current legal documents.</li>
          <li><strong>Age-eligibility information:</strong> during signup, a birth date is evaluated separately to determine whether account creation is available under the applicable California calendar date. The entered birth date is not retained. We keep a short-lived, one-use eligibility proof or ineligibility marker that does not contain the birth date, age, email address, or account details. After account creation, we retain the time of the successful eligibility check.</li>
          <li><strong>Preferences:</strong> saved fishing locations and optional gear presets.</li>
          <li><strong>Trip-report information:</strong> a curated fishing location, date and time, effort, method, catch or no-catch outcome, gear, fishability observations, notes, forecast context, model version, and an optional photo.</li>
          <li><strong>Community information:</strong> your pseudonymous handle and optional bio; posts, comments, edits, reports, blocks, moderation status, and the supported public place connected to a discussion. Your account email is not displayed as your community identity.</li>
          <li><strong>Technical and security information:</strong> secure session identifiers, pseudonymous identifiers used for rate limiting and abuse prevention, credential-security signals, request and error records, and limited network, device, and browser information processed in connection with operating and securing the service.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Optional browser location">
        <p>If you choose “Near me” or a distance radius, the browser asks for your current location. CastingCompass uses it in the open browser tab to sort nearby public fishing locations and apply the radius. The coordinate is not sent to the CastingCompass account API, not saved to your account, and not added to a trip report. Closing or refreshing the tab clears the app’s in-memory copy. Your browser and operating system control the underlying permission.</p>
      </LegalSection>

      <LegalSection title="3. How information is used">
        <p>We use information to provide and maintain the service; create, authenticate, and protect accounts; save your preferences; operate forecasts and trip-reporting tools; respond to support and privacy requests; prevent fraud, abuse, and security incidents; moderate community features; evaluate product performance; comply with legal obligations; and research, develop, and improve the service. Trip outcomes and observations may be used to evaluate or develop future forecasting models, subject to the disclosures and controls described in this Policy.</p>
      </LegalSection>

      <LegalSection title="4. Automated review and public summaries">
        <p>Completed trip information may be processed by an external automated-review service to standardize gear information and assess notes for privacy, safety, relevance, and usefulness. The limited review data may include the curated site, trip time, method, catch totals, gear, fishability observations, forecast and model context, and up to 1,000 characters of notes. We exclude your email address, internal account identifier, uploaded photo, and structured browser-location or coordinate fields from that review data.</p>
        <p>Free-text fields are processed as submitted and may contain information you choose to enter. Do not include names, contact information, private access instructions, exact sensitive locations, or other confidential information in a trip report.</p>
        <p>Before a queued review is authorized, the service performs a final deletion-record check. A deletion completed before that check prevents the external request. A request already authorized or transmitted before deletion cannot be recalled and may finish processing under the receiving service&apos;s terms; its response cannot restore the deleted trip or publish a discussion post.</p>
        <p>Automated review may prepare a shortened, pseudonymous discussion draft, but it cannot publish or approve the draft. A human moderator must approve a draft before it can appear publicly. Automated and human review may be imperfect. You may request correction or removal by contacting us.</p>
      </LegalSection>

      <LegalSection title="5. How we disclose information">
        <p>We disclose information only as reasonably necessary to operate, secure, and improve the service; complete a request you make; comply with law or legal process; or protect the rights, safety, and integrity of CastingCompass, its users, or others. The categories of recipients may include:</p>
        <ul>
          <li><strong>Infrastructure and security providers</strong> that host the service, store application data, deliver content, maintain operational logs, and help detect or prevent abuse.</li>
          <li><strong>Communications providers</strong> that deliver account verification, password-recovery, welcome, and support messages.</li>
          <li><strong>Credential-security services</strong> that help identify passwords known to have been compromised. We do not send these services your password, email address, or complete password hash.</li>
          <li><strong>Automated-processing providers</strong> that perform the limited trip-note and gear review described above.</li>
          <li><strong>Public-data and mapping services</strong> that supply weather, tide, marine, bathymetry, fisheries, location, or agency information, or that open when you follow an external link.</li>
          <li><strong>Legal, safety, and transactional recipients</strong> when disclosure is required by law, necessary to protect rights or safety, or part of a merger, financing, acquisition, reorganization, or transfer of the service, subject to applicable law.</li>
        </ul>
        <p>External services process information under their own terms and privacy notices. We seek to provide only the information reasonably necessary for the applicable function.</p>
        <p>We do not currently sell personal information, share it for cross-context behavioral advertising, or use third-party advertising trackers. If those practices change, we will update this Policy and provide any notice or choice required by applicable law before the change takes effect.</p>
      </LegalSection>

      <LegalSection title="6. Retention">
        <ul>
          <li>Accounts, saved locations, gear presets, trip reports, and community content are retained until deleted, removed, or no longer reasonably needed for moderation, safety, or legal obligations. Reports and moderation records may be retained after content removal when reasonably necessary to address abuse.</li>
          <li>Signup eligibility proofs can be used for 10 minutes and are removed after a short operational buffer of about 24 hours. A browser that receives an ineligibility result may keep a first-party marker for up to 24 hours so returning to the prior screen does not restart collection; neither artifact contains the entered birth date, age, email address, or account details.</li>
          <li>Sessions expire after 30 days and expired session records are periodically removed.</li>
          <li>Email challenges expire after 15 minutes and are removed after a short operational buffer.</li>
          <li>Rate-limit attempts are retained for up to about 30 days.</li>
          <li>After an account deletion request, the secure browser status receipt expires after 30 days or sooner if you dismiss it. Dismissing the receipt does not cancel cleanup. Pseudonymous completed-deletion records are retained for about 90 days to prevent deleted data from being unintentionally restored. Unresolved photo-cleanup jobs are retained until cleanup succeeds or is resolved by an operator.</li>
          <li>Operational, security, and delivery records maintained by service providers may follow those providers&apos; retention schedules.</li>
          <li>De-identified or aggregated information that can no longer reasonably identify you may be retained for research and service improvement.</li>
        </ul>
        <p>Deletion removes account access and linked database records from the active service first. Stored trip-photo objects may require background cleanup. The deletion-status receipt reports whether that cleanup is completed, processing, or needs operator attention. Backup copies may remain for a limited operational period and are not intended for ordinary service use; deletion records must be replayed before a backup restoration can return to service.</p>
      </LegalSection>

      <LegalSection title="7. Your choices and privacy rights">
        <p>From Profile, you can view saved locations and reports, edit or remove pending reports, download a machine-readable JSON copy of account records, and permanently delete the account. When background packaging is enabled, the private JSON file is available only to the signed-in owner and expires after 24 hours; otherwise the authenticated response is generated directly. When stored photos exist, the export includes a manifest with authenticated links for downloading those photo files separately; the photos are not embedded in the JSON file. You can also deny or revoke browser location permission and use the public forecast without an account.</p>
        <p>After an accepted deletion request, sign-in access, saved locations, gear presets, linked trip reports, community profile and content, and linked public discussion summaries are removed from the active database. CastingCompass also clears its account-related trip drafts and anonymous reporting identifier from the current browser when browser storage is available, and reports when the browser blocks that cleanup. If photo-object cleanup continues in the background, Profile displays that limited status using a secure receipt that cannot restore account access.</p>
        <p>Depending on where you live and the law that applies, you may have rights to know, access, correct, delete, or receive a copy of personal information; to opt out of certain sale, sharing, or targeted-advertising practices; to limit certain uses of sensitive personal information; and to receive non-discriminatory treatment. CastingCompass currently provides access and deletion tools even where not legally required. To submit a request that the product controls do not cover, email <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a>. We may need to verify your identity or authority before completing a request.</p>
      </LegalSection>

      <LegalSection title="8. Children’s privacy">
        <p>CastingCompass accounts are not available to children under 13. We use a neutral, age-only first screen and do not retain the entered birth date. A short-lived eligibility or ineligibility result may be kept without the birth date, age, email address, or other account details as described above. If we learn that personal information was collected from a child under 13, we will delete it. A parent or guardian can contact us about a suspected underage account.</p>
      </LegalSection>

      <LegalSection title="9. Security, transfers, and Do Not Track">
        <p>We use administrative, technical, and organizational safeguards designed to protect information, including credential hashing, secure session controls, request validation, access controls, rate limits, and removal of photo metadata. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.</p>
        <p>We and our service providers may process information in the United States and other locations where those providers operate. Those locations may have different data-protection laws from your place of residence.</p>
        <p>CastingCompass does not currently respond differently to browser “Do Not Track” signals because it does not use cross-site advertising trackers. External sites and services linked from CastingCompass may collect information under their own policies.</p>
      </LegalSection>

      <LegalSection title="10. Changes and contact">
        <p>We may update this Policy from time to time. The revised version will state its effective date, and we will provide additional notice or request renewed acceptance when appropriate. Questions, privacy requests, and public-summary correction or removal requests may be sent to <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
