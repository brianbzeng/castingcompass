/* eslint-disable @eslint-react/dom-no-dangerously-set-innerhtml -- The only raw HTML is a static,
 * JSON-stringified schema object with less-than characters escaped below. */
import type { Metadata } from "next";
import { OpportunityApp } from "../components/OpportunityApp";

const FORECAST_URL = "https://castingcompass.com/forecast";
const FORECAST_TITLE = "California coastal fishing planner · CastingCompass";
const FORECAST_DESCRIPTION =
  "Compare public Bay Area and Santa Barbara South Coast fishing windows using explainable relative rankings from habitat, seasonality, and current conditions.";

export const metadata: Metadata = {
  title: { absolute: FORECAST_TITLE },
  description: FORECAST_DESCRIPTION,
  alternates: { canonical: FORECAST_URL },
  openGraph: {
    title: FORECAST_TITLE,
    description: FORECAST_DESCRIPTION,
    type: "website",
    url: FORECAST_URL,
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
    title: FORECAST_TITLE,
    description: FORECAST_DESCRIPTION,
    images: [{
      url: "/og.png",
      alt: "CastingCompass — California coastal fishing planner",
    }],
  },
};

const forecastStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "CastingCompass",
  applicationCategory: "SportsApplication",
  operatingSystem: "Web",
  url: FORECAST_URL,
  description: FORECAST_DESCRIPTION,
  inLanguage: "en-US",
};

export default function ForecastPage() {
  return (
    <>
      <script
        id="castingcompass-forecast-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(forecastStructuredData).replace(/</g, "\\u003c"),
        }}
      />
      <OpportunityApp />
    </>
  );
}
