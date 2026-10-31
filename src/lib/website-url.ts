/**
 * Client-safe check and tidy-up for a "my current website" address typed by a
 * visitor. This is a courtesy for the visitor (typos, wrong schemes) and a
 * first filter. It is NOT the security boundary: the server import re-validates
 * every address and every redirect hop with the net guard (public hosts only,
 * timeout, size cap) before anything is fetched.
 */
export type WebsiteUrlResult = { ok: true; url: string } | { ok: false; message: string };

const MAX_LENGTH = 200;
const BLOCKED_HOSTS = new Set(["localhost", "metadata", "instance-data"]);
const BLOCKED_SUFFIXES = [
  ".local",
  ".internal",
  ".localhost",
  ".localdomain",
  ".home.arpa",
  ".onion",
  ".test",
  ".invalid",
];

export function normalizeWebsiteUrl(raw: string): WebsiteUrlResult {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, message: "Enter your website address, like yourbusiness.com." };
  if (value.length > MAX_LENGTH) return { ok: false, message: "That address is too long." };
  if (/\s/.test(value)) return { ok: false, message: "A website address can't contain spaces." };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  // "example.com:8080" has a colon but is not a scheme; only "x://" or known risky schemes count.
  if (scheme && /^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
    return { ok: false, message: "Only http and https website addresses can be imported." };
  }
  if (/^(javascript|data|file|blob|mailto|tel):/i.test(value)) {
    return { ok: false, message: "Only http and https website addresses can be imported." };
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, message: "That doesn't look like a website address." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: "Only http and https website addresses can be imported." };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const ipLike =
    host.includes(":") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    /^\d+$/.test(host) ||
    /^0x[0-9a-f]+$/i.test(host);
  const publicName =
    host.length <= 253 &&
    /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) &&
    host
      .split(".")
      .every((label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
  if (
    ipLike ||
    !publicName ||
    BLOCKED_HOSTS.has(host) ||
    BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return { ok: false, message: "Enter a public website address, like yourbusiness.com." };
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  url.hostname = host;
  const text = url.toString();
  // A bare domain reads better without the trailing slash the URL class adds.
  return { ok: true, url: url.pathname === "/" && !url.search ? text.replace(/\/$/, "") : text };
}
