const LISTING_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** @type {Readonly<Record<string, string>>} */
const SEGMENTS = Object.freeze({ event: "events", benefit: "benefits" });

/**
 * Return the stable public path for one listing.
 *
 * @param {{ id: string, kind: string }} listing
 * @param {{ prefix?: string }} [options]
 * @returns {string}
 */
export function listingPermalink(listing, { prefix = "" } = {}) {
  const segment = SEGMENTS[listing?.kind];
  if (!segment) throw new TypeError("listing kind must be event or benefit");
  if (!LISTING_ID_PATTERN.test(listing?.id || "")) {
    throw new TypeError("listing id must be a lowercase URL-safe identifier");
  }
  if (prefix && !prefix.endsWith("/")) {
    throw new TypeError("listing permalink prefix must be empty or end with /");
  }
  return `${prefix}${segment}/${listing.id}/`;
}

/**
 * Return the generated artifact path for one listing page.
 *
 * @param {{ id: string, kind: string }} listing
 * @returns {string}
 */
export function listingOutputPath(listing) {
  return `${listingPermalink(listing)}index.html`;
}
