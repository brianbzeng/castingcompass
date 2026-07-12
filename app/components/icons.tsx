import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function LogoMark(props: IconProps) {
  return (
    <svg {...base} {...props} viewBox="0 0 40 40">
      <path d="M5 25c5-8 10-12 15-12 6 0 10 4 15 12" />
      <path d="M7 29c4-5 8-7 13-7s9 2 13 7" opacity=".72" />
      <path d="M12 32c3-2.6 5.5-4 8-4 2.6 0 5.2 1.4 8 4" opacity=".42" />
      <path d="M20 7v7" />
      <circle cx="20" cy="7" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MapIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15M16 6v15"/></svg>;
}

export function ListIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>;
}

export function LocateIcon(props: IconProps) {
  return <svg {...base} {...props}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>;
}

export function ChevronIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m9 18 6-6-6-6"/></svg>;
}

export function CloseIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M18 6 6 18M6 6l12 12"/></svg>;
}

export function ClockIcon(props: IconProps) {
  return <svg {...base} {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
}

export function WindIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a2 2 0 1 1-2 2M3 16h8"/></svg>;
}

export function TideIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M2 15c3-4 5-4 8 0s5 4 8 0 4-2 4-2"/><path d="M5 9h14M12 3v6M9 6l3 3 3-3"/></svg>;
}

export function TemperatureIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M14 14.8V5a4 4 0 0 0-8 0v9.8a6 6 0 1 0 8 0Z"/><path d="M10 9v8"/></svg>;
}

export function CloudIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M6 18h11a4 4 0 0 0 .5-8A6 6 0 0 0 6.2 8.2 4.9 4.9 0 0 0 6 18Z"/></svg>;
}

export function PressureIcon(props: IconProps) {
  return <svg {...base} {...props}><circle cx="12" cy="12" r="8"/><path d="m12 12 4-3M8 17h8"/></svg>;
}

export function MoonIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M20 15.5A8.5 8.5 0 1 1 8.5 4 7 7 0 0 0 20 15.5Z"/></svg>;
}

export function ArrowIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
}

export function LayersIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></svg>;
}

export function InfoIcon(props: IconProps) {
  return <svg {...base} {...props}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>;
}

export function DownloadIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>;
}
