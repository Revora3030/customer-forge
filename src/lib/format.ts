export const currency = (value: number | null | undefined, compact = false) => {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact && Math.abs(n) >= 1000 ? 1 : 0,
    notation: compact && Math.abs(n) >= 10000 ? "compact" : "standard",
  }).format(n);
};

export const number = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-US").format(Number(value ?? 0));

export const percent = (value: number | null | undefined, digits = 1) =>
  `${Number(value ?? 0).toFixed(digits)}%`;

export const dateShort = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

export const dateLong = (value: string | Date | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export const timeShort = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—";

export const relative = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ${suffix}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ${suffix}`;
  return dateShort(value);
};

export const initials = (name: string | null | undefined) =>
  (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/**
 * Display a US phone number as (919) 555-0123. Accepts 10 digits or 11 with a
 * leading 1, with or without +1, spaces, dots or dashes. Anything that is not a
 * US number (a +44 number, an extension, an incomplete number) is returned
 * exactly as it was typed, and an empty value stays empty. Display only: the
 * stored value is never changed.
 */
export const formatUsPhone = (value: string | null | undefined): string => {
  const raw = value == null ? "" : String(value);
  const text = raw.trim();
  if (!text) return raw;
  // Anything beyond digits and common separators ("ext", letters, a non-+1 prefix) is left alone.
  if (/[^\d\s().+-]/.test(text)) return raw;
  if (text.includes("+") && !/^\+\s*1\D*\d/.test(text)) return raw;
  const digits = text.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return raw;
  // North American area codes and exchanges never start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{2}\d{4}$/.test(national)) return raw;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
};
