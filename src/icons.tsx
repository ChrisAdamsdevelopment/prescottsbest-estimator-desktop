import type { ReactNode } from 'react';
type IconProps = { size?: number; strokeWidth?: number };
const make = (children: ReactNode) => ({ size = 20, strokeWidth = 2 }: IconProps) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;

export const AlertTriangle = make(<><path d="M10.3 3.7 1.9 18.4a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></>);
export const ArrowLeft = make(<><path d="m12 19-7-7 7-7M5 12h14"/></>);
export const Camera = make(<><path d="M14 4H9l-2 3H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/></>);
export const Check = make(<path d="m4 12 5 5L20 6"/>);
export const ClipboardList = make(<><rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4"/></>);
export const Download = make(<><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></>);
export const FileText = make(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>);
export const FolderOpen = make(<><path d="M3 7V5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2"/><path d="M3 9h18l-2 11H5z"/></>);
export const HardHat = make(<><path d="M3 18h18M5 18v-4a7 7 0 0 1 14 0v4M9 7V5a3 3 0 0 1 6 0v2M12 8v7"/></>);
export const ImagePlus = make(<><rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m2 17 6-5 4 4 4-3 6 5M17 7h4m-2-2v4"/></>);
export const Plus = make(<path d="M12 5v14M5 12h14"/>);
export const Printer = make(<><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 15h12v7H6z"/></>);
export const Save = make(<><path d="M4 3h14l3 3v15H3V3z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></>);
export const Settings2 = make(<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></>);
export const ShieldAlert = make(<><path d="M12 2 3 6v6c0 6 4 9 9 10 5-1 9-4 9-10V6z"/><path d="M12 8v5m0 4h.01"/></>);
export const Sparkles = make(<><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM19 2v4m-2-2h4"/></>);
export const Trash2 = make(<><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>);
export const Upload = make(<><path d="M12 17V3m-5 5 5-5 5 5M4 17v4h16v-4"/></>);
export const X = make(<path d="M18 6 6 18M6 6l12 12"/>);
