/**
 * Design directions — industry-specific visual identity presets.
 */

export type DesignDirection = {
  heroEffect?: string;
  ctaEffect?: string;
  formEffect?: string;
  bodyEffect?: string;
  layout?: string;
  id: string;
  label: string;
  industry: string;
  primary: string;
  accent: string;
  surface: string;
  text: string;
  muted: string;
  fontDisplay: string;
  fontBody: string;
  personality: "warm" | "cool" | "bold" | "muted" | "earthy";
};

export const DESIGN_DIRECTIONS: DesignDirection[] = [
  {
    id: "coastal-blue",
    label: "Coastal Blue",
    industry: "marine",
    primary: "#0c4e54",
    accent: "#4f98a3",
    surface: "#f7f6f2",
    text: "#28251d",
    muted: "#7a7974",
    fontDisplay: "Cabinet Grotesk",
    fontBody: "Satoshi",
    personality: "cool",
  },
  {
    id: "warm-earth",
    label: "Warm Earth",
    industry: "automotive",
    primary: "#964219",
    accent: "#da7101",
    surface: "#f7f6f2",
    text: "#28251d",
    muted: "#7a7974",
    fontDisplay: "Clash Display",
    fontBody: "Satoshi",
    personality: "earthy",
  },
  {
    id: "clean-clinical",
    label: "Clean Clinical",
    industry: "dental",
    primary: "#006494",
    accent: "#5591c7",
    surface: "#fbfbf9",
    text: "#28251d",
    muted: "#7a7974",
    fontDisplay: "Switzer",
    fontBody: "General Sans",
    personality: "cool",
  },
  {
    id: "modern-warm",
    label: "Modern Warm",
    industry: "restaurant",
    primary: "#a13544",
    accent: "#e8af34",
    surface: "#f7f6f2",
    text: "#28251d",
    muted: "#7a7974",
    fontDisplay: "Boska",
    fontBody: "Source Serif 4",
    personality: "warm",
  },
  {
    id: "bold-creative",
    label: "Bold Creative",
    industry: "agency",
    primary: "#7a39bb",
    accent: "#a86fdf",
    surface: "#171614",
    text: "#cdccca",
    muted: "#797876",
    fontDisplay: "Clash Grotesk",
    fontBody: "General Sans",
    personality: "bold",
  },
  {
    id: "premium-minimal",
    label: "Premium Minimal",
    industry: "default",
    primary: "#01696f",
    accent: "#4f98a3",
    surface: "#f7f6f2",
    text: "#28251d",
    muted: "#7a7974",
    fontDisplay: "Cabinet Grotesk",
    fontBody: "Satoshi",
    personality: "muted",
  },
];
