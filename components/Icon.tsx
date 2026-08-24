import type { CSSProperties, ReactNode, SVGProps } from "react";

export type IconName =
  | "arrow-left"
  | "badge-check"
  | "bell"
  | "calendar"
  | "check"
  | "chevron-right"
  | "clock"
  | "heart"
  | "home"
  | "id-card"
  | "key-round"
  | "lock"
  | "map-pin"
  | "navigation"
  | "plus"
  | "qr-code"
  | "refresh-cw"
  | "search"
  | "shield-check"
  | "smartphone"
  | "user"
  | "users"
  | "x"
  | "zap";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

const icons: Record<IconName, ReactNode> = {
  "arrow-left": <><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></>,
  "badge-check": <><path d="M12 3.5 14 5l2.5-.1.8 2.4 2.1 1.4-.8 2.3.8 2.3-2.1 1.4-.8 2.4L14 17l-2 1.5L10 17l-2.5.1-.8-2.4-2.1-1.4.8-2.3-.8-2.3 2.1-1.4.8-2.4L10 5Z"/><path d="m9.3 11.5 1.7 1.7 3.8-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  "chevron-right": <path d="m9 18 6-6-6-6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
  "id-card": <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5.5 16c.8-1.5 4.2-1.5 5 0M14 10h4M14 14h4"/></>,
  "key-round": <><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  "map-pin": <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  navigation: <path d="m4 4 16 7-7 2-2 7Z"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  "qr-code": <><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h2v2h-2zM19 15h2v6h-2M15 19h2v2h-2"/></>,
  "refresh-cw": <><path d="M20 6v5h-5"/><path d="M18.5 16a8 8 0 1 1 1.2-8L20 11"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  "shield-check": <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  smartphone: <><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5 4.5"/></>,
  x: <path d="M6 6l12 12M18 6 6 18"/>,
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>,
};

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: IconName;
  size?: IconSize | number;
  label?: string;
  strokeWidth?: number;
};

export default function Icon({ name, size = "md", label, strokeWidth = 2, className, style, ...props }: IconProps) {
  const tokenClass = typeof size === "string" ? `ui-icon--${size}` : "";
  const pixelStyle: CSSProperties | undefined = typeof size === "number" ? { ...style, width: size, height: size } : style;
  return <svg
    {...props}
    className={["ui-icon", tokenClass, className].filter(Boolean).join(" ")}
    style={pixelStyle}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? "img" : undefined}
    focusable="false"
  >
    {label && <title>{label}</title>}
    {icons[name]}
  </svg>;
}
