import { productionUrl } from "./site-url.bcec63b02a0e.js";

const FEEDBACK_ORIGIN = "https://github.com";
const FEEDBACK_REPOSITORY_PATH = "/wonvie87/nearfree-dfw-site/issues/new";
const LISTING_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** @param {unknown} value @param {string} label */
function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

/** @param {unknown} value @param {string} listingId */
function validatedListingUrl(value, listingId) {
  const url = productionUrl(value, "listing URL");
  const routePattern = new RegExp(`^/(?:ko/)?(?:events|benefits)/${listingId}/$`);
  if (!routePattern.test(url.pathname)) {
    throw new TypeError("listing URL must be the matching clean nearfree.app detail URL");
  }
  return url.href;
}

/** @param {string} template */
function feedbackFormUrl(template) {
  const url = new URL(FEEDBACK_REPOSITORY_PATH, FEEDBACK_ORIGIN);
  url.searchParams.set("template", template);
  return url;
}

/**
 * @param {{ id: string, title: string }} listing
 * @param {{ canonicalUrl: string }} options
 */
export function listingCorrectionUrl(listing, options) {
  if (!listing || !LISTING_ID_PATTERN.test(listing.id || "")) {
    throw new TypeError("listing correction ID must be URL-safe");
  }
  const title = requiredText(listing.title, "listing title");
  const canonicalUrl = validatedListingUrl(options?.canonicalUrl, listing.id);
  const url = feedbackFormUrl("listing-correction.yml");
  url.searchParams.set("title", `[Listing correction]: ${title}`);
  url.searchParams.set("listing", `${title} — ${canonicalUrl}`);
  return url.href;
}

export function listingSuggestionUrl() {
  return feedbackFormUrl("listing-suggestion.yml").href;
}
