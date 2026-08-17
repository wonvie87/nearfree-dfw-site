export const PRODUCTION_ORIGIN = "https://nearfree.app";

/** @param {unknown} value @param {string} label */
function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

/** @param {unknown} value @param {string} [label] */
export function productionUrl(value, label = "site URL") {
  let url;
  try {
    url = new URL(requiredText(value, label));
  } catch (error) {
    if (error instanceof TypeError && error.message === `${label} is required`) throw error;
    throw new TypeError(`${label} must be an absolute URL`, { cause: error });
  }
  if (url.origin !== PRODUCTION_ORIGIN || url.username || url.password || url.search || url.hash) {
    throw new TypeError(`${label} must be a clean nearfree.app HTTPS URL`);
  }
  return url;
}

/** @param {unknown} value @param {string} [label] */
export function sitePath(value, label = "site path") {
  const path = requiredText(value, label);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new TypeError(`${label} must be a root-relative site path`);
  }
  const url = new URL(path, PRODUCTION_ORIGIN);
  if (url.origin !== PRODUCTION_ORIGIN || url.pathname !== path || url.search || url.hash) {
    throw new TypeError(`${label} must stay on the production origin without query or fragment`);
  }
  return url.pathname;
}

/** @param {unknown} path */
export function siteUrl(path) {
  return new URL(sitePath(path), PRODUCTION_ORIGIN).href;
}
