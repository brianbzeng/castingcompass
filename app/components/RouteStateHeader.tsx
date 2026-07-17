import Link from "next/link";
import { LogoMark } from "./icons";

export function RouteStateHeader() {
  return (
    <header className="route-state-header">
      <Link className="route-state-brand" href="/" aria-label="CastingCompass home">
        <LogoMark />
        <span>CastingCompass</span>
      </Link>
    </header>
  );
}
