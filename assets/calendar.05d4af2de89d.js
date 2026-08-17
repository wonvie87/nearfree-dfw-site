import { listingPermalink } from "./listing-permalinks.67fda15d5c1a.js";
import { productionUrl } from "./site-url.bcec63b02a0e.js";

const EVENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;
const CALENDAR_LINE_OCTETS = 75;
export const DFW_CALENDAR_TIME_ZONE = "America/Chicago";

/**
 * @typedef {object} CalendarListing
 * @property {string} id
 * @property {string} kind
 * @property {string} start
 * @property {string | null} end
 * @property {string} title
 * @property {string} dateLabel
 * @property {string} venue
 * @property {string} address
 * @property {string} city
 * @property {string} verifiedAt
 * @property {string} [overview]
 * @property {string} [summary]
 */

/** @param {unknown} value @param {string} label */
function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

/** @param {string} value @param {string} label */
function timestamp(value, label) {
  const match = value.match(ISO_TIMESTAMP_PATTERN);
  if (!match) throw new TypeError(`${label} must be an ISO timestamp with an explicit offset`);
  const [, year, month, day, hour, minute, second, , zone] = match;
  const numeric = [year, month, day, hour, minute, second].map(Number);
  const [yearNumber, monthNumber, dayNumber, hourNumber, minuteNumber, secondNumber] = numeric;
  const calendarDate = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));
  const offsetHours = zone === "Z" ? 0 : Number(zone.slice(1, 3));
  const offsetMinutes = zone === "Z" ? 0 : Number(zone.slice(4, 6));
  if (
    calendarDate.getUTCFullYear() !== yearNumber ||
    calendarDate.getUTCMonth() !== monthNumber - 1 ||
    calendarDate.getUTCDate() !== dayNumber ||
    hourNumber > 23 ||
    minuteNumber > 59 ||
    secondNumber > 59 ||
    offsetHours > 23 ||
    offsetMinutes > 59
  ) {
    throw new TypeError(`${label} must be a valid ISO timestamp`);
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) {
    throw new TypeError(`${label} must be a valid ISO timestamp`);
  }
  return instant;
}

/** @param {Date} value */
function utcCalendarTimestamp(value) {
  return value
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** @param {unknown} value @param {string} eventId */
function canonicalListingUrl(value, eventId) {
  const url = productionUrl(value, "canonical URL");
  const routePattern = new RegExp(`^/(?:ko/)?events/${eventId}/$`);
  if (!routePattern.test(url.pathname)) {
    throw new TypeError("canonical URL must match the scheduled event detail route");
  }
  return url.href;
}

/** @param {CalendarListing} listing */
function calendarEvent(listing) {
  if (!listing || listing.kind !== "event") {
    throw new TypeError("calendar export is available only for scheduled events");
  }
  if (!EVENT_ID_PATTERN.test(listing.id || "")) {
    throw new TypeError("calendar event ID must be URL-safe");
  }
  const start = timestamp(listing.start, "event start");
  if (!listing.end) throw new TypeError("calendar event end is required");
  const end = timestamp(listing.end, "event end");
  if (end <= start) throw new TypeError("calendar event end must be after its start");
  return {
    id: listing.id,
    title: requiredText(listing.title, "event title"),
    dateLabel: requiredText(listing.dateLabel, "event schedule label"),
    venue: requiredText(listing.venue, "event venue"),
    address: requiredText(listing.address, "event address"),
    city: requiredText(listing.city, "event city"),
    description: requiredText(listing.overview || listing.summary, "event description"),
    start,
    end,
    verifiedAt: timestamp(listing.verifiedAt, "event verification time"),
  };
}

/** @param {string} value */
function escapeCalendarText(value) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(/\r?\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

/** @param {string} line */
function foldCalendarLine(line) {
  const encoder = new TextEncoder();
  const segments = [];
  let current = "";
  let octets = 0;
  for (const character of line) {
    const characterOctets = encoder.encode(character).length;
    if (current && octets + characterOctets > CALENDAR_LINE_OCTETS) {
      segments.push(current);
      current = ` ${character}`;
      octets = 1 + characterOctets;
    } else {
      current += character;
      octets += characterOctets;
    }
  }
  segments.push(current);
  return segments.join("\r\n");
}

/** @param {ReturnType<typeof calendarEvent>} event @param {string} url @param {string} detailsLabel */
function eventDescription(event, url, detailsLabel) {
  return `${event.dateLabel}\n\n${event.description}\n\n${requiredText(detailsLabel, "calendar details label")}: ${url}`;
}

/**
 * @param {CalendarListing} listing
 * @param {{ canonicalUrl: string, detailsLabel: string }} options
 */
export function googleCalendarUrl(listing, options) {
  const event = calendarEvent(listing);
  const url = canonicalListingUrl(options?.canonicalUrl, event.id);
  const calendarUrl = new URL("https://calendar.google.com/calendar/render");
  calendarUrl.searchParams.set("action", "TEMPLATE");
  calendarUrl.searchParams.set("text", event.title);
  calendarUrl.searchParams.set(
    "dates",
    `${utcCalendarTimestamp(event.start)}/${utcCalendarTimestamp(event.end)}`,
  );
  calendarUrl.searchParams.set("details", eventDescription(event, url, options?.detailsLabel));
  calendarUrl.searchParams.set("location", `${event.venue}, ${event.address}`);
  calendarUrl.searchParams.set("ctz", DFW_CALENDAR_TIME_ZONE);
  return calendarUrl.href;
}

/**
 * @param {CalendarListing} listing
 * @param {{ canonicalUrl: string, detailsLabel: string }} options
 */
export function renderCalendarFile(listing, options) {
  const event = calendarEvent(listing);
  const url = canonicalListingUrl(options?.canonicalUrl, event.id);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NearFree//DFW Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@nearfree.app`,
    `DTSTAMP:${utcCalendarTimestamp(event.verifiedAt)}`,
    `DTSTART:${utcCalendarTimestamp(event.start)}`,
    `DTEND:${utcCalendarTimestamp(event.end)}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `DESCRIPTION:${escapeCalendarText(eventDescription(event, url, options?.detailsLabel))}`,
    `LOCATION:${escapeCalendarText(`${event.venue}, ${event.address}`)}`,
    `URL:${url}`,
    "STATUS:CONFIRMED",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldCalendarLine).join("\r\n")}\r\n`;
}

/** @param {{ id: string, kind: string }} listing @param {{ locale?: "en" | "ko" }} [options] */
export function calendarFilePath(listing, { locale = "en" } = {}) {
  if (listing?.kind !== "event") {
    throw new TypeError("calendar files belong only to scheduled events");
  }
  return `${listingPermalink(listing, { locale })}event.ics`;
}
