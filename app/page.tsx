import type { Metadata } from "next";
import { OpportunityApp } from "./components/OpportunityApp";

export const metadata: Metadata = {
  title: { absolute: "ContourCast — California halibut opportunity planner" },
  description:
    "Compare legal shore and pier fishing windows around the San Francisco Bay Area using habitat, seasonality, and current conditions.",
};

export default function Home() {
  return <OpportunityApp />;
}
