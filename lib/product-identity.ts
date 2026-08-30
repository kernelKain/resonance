export type ProductIdentity = {
  name: string;
  sourceUrl?: string;
  logoUrl?: string;
  fromPage?: boolean;
};

export function asProductUrl(input: string): URL | null {
  const value = input.trim();
  if (!value) return null;
  const looksLikeUrl =
    value.includes("://") || /^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value);
  if (!looksLikeUrl) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function hostnameLabel(url: URL): string {
  const hostname = url.hostname.replace(/^www\./i, "");
  const first = hostname.split(".")[0] ?? hostname;
  return first
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Never show a pasted URL as the on-screen product title. */
export function brandNameFrom(identity: ProductIdentity | null, fallback: string): string {
  const raw = (identity?.name || fallback).trim();
  if (!raw) return "Analysis";
  const url = asProductUrl(raw);
  if (url) return hostnameLabel(url);
  return raw;
}
