import type { Metadata } from "next";
import { DiscoveryPrototype } from "../components/DiscoveryPrototype";

export const metadata: Metadata = {
  title: "Map discovery prototype",
  description: "A desktop CastingCompass map discovery prototype for exploring public coastal fishing locations.",
};

export default function DiscoverPage() {
  return <DiscoveryPrototype />;
}
