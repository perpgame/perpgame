/**
 * Validate that a URL is a safe, external HTTP(S) URL.
 * Rejects data:, javascript:, blob:, and private/internal IPs.
 */

const PRIVATE_HOST_RE = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[::1?\])$/i;

export function isValidHttpUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return false;

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (PRIVATE_HOST_RE.test(url.hostname)) return false;

  return true;
}
