import type { Metadata } from "next";
import sites from "../../../public/data/sites.json";
import { NativeAuthorizationPage } from "../../components/NativeAuthorizationPage";
import type { FishingSite } from "../../types";

export const metadata: Metadata = {
  title: "Continue to CastingCompass",
  description: "Securely continue a signed-in CastingCompass account session in the iOS app.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function NativeAuthorizeRoute() {
  return <NativeAuthorizationPage sites={sites as FishingSite[]} />;
}
