export const DFW_TIME_ZONE = "America/Chicago";

const dateFormatterCache = new Map();

function dateFormatter(timeZone) {
  if (!dateFormatterCache.has(timeZone)) {
    dateFormatterCache.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }));
  }
  return dateFormatterCache.get(timeZone);
}

function zonedParts(date, timeZone) {
  return Object.fromEntries(dateFormatter(timeZone)
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
}

function dateKey({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dateKeyInTimeZone(date = new Date(), timeZone = DFW_TIME_ZONE) {
  return dateKey(zonedParts(date, timeZone));
}

export function addCalendarDays(value, count) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + count));
  return date.toISOString().slice(0, 10);
}

export function calendarDayDifference(from, to, timeZone = DFW_TIME_ZONE) {
  const fromKey = dateKeyInTimeZone(new Date(from), timeZone);
  const toKey = dateKeyInTimeZone(new Date(to), timeZone);
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

export function zonedDateTime(value, hour = 0, timeZone = DFW_TIME_ZONE) {
  const [year, month, day] = value.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, hour);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const correction = target - represented;
    guess += correction;
    if (correction === 0) break;
  }
  return new Date(guess);
}

export function dayWindow(now = new Date(), offset = 0, timeZone = DFW_TIME_ZONE) {
  const startKey = addCalendarDays(dateKeyInTimeZone(now, timeZone), offset);
  return {
    start: zonedDateTime(startKey, 0, timeZone),
    end: zonedDateTime(addCalendarDays(startKey, 1), 0, timeZone)
  };
}

export function tonightWindow(now = new Date(), timeZone = DFW_TIME_ZONE) {
  const key = dateKeyInTimeZone(now, timeZone);
  return {
    start: zonedDateTime(key, 17, timeZone),
    end: zonedDateTime(addCalendarDays(key, 1), 0, timeZone)
  };
}

export function weekendWindow(now = new Date(), timeZone = DFW_TIME_ZONE) {
  const todayKey = dateKeyInTimeZone(now, timeZone);
  const day = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  if (day === 0) {
    return {
      start: zonedDateTime(todayKey, 0, timeZone),
      end: zonedDateTime(addCalendarDays(todayKey, 1), 0, timeZone)
    };
  }
  const saturdayKey = addCalendarDays(todayKey, (6 - day + 7) % 7);
  return {
    start: zonedDateTime(saturdayKey, 0, timeZone),
    end: zonedDateTime(addCalendarDays(saturdayKey, 2), 0, timeZone)
  };
}

export function overlapsWindow(listing, window) {
  const start = new Date(listing.start);
  const end = listing.end ? new Date(listing.end) : new Date("2999-12-31T23:59:59Z");
  return start < window.end && end >= window.start;
}

export function isRecentlyVerified(
  listing,
  now = new Date(),
  days = 7,
) {
  const verifiedAt = new Date(listing.verifiedAt);
  const elapsed = now - verifiedAt;
  return (
    Number.isFinite(verifiedAt.getTime()) &&
    elapsed >= 0 &&
    elapsed <= days * 86_400_000
  );
}

export function distanceMiles(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadius = 3958.8;
  const dLat = radians(right.lat - left.lat);
  const dLng = radians(right.lng - left.lng);
  const lat1 = radians(left.lat);
  const lat2 = radians(right.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function buildSearchText(listing, original = listing) {
  return [
    listing.title,
    listing.city,
    listing.venue,
    listing.cardHook,
    listing.overview,
    listing.summary,
    listing.cost,
    listing.finePrint,
    listing.eligibility?.detail,
    listing.booking?.detail,
    ...(listing.highlights || []),
    ...(listing.description || []),
    ...(listing.tags || []),
    original.title,
    original.cardHook,
    original.overview,
    original.summary,
    original.cost,
    original.finePrint,
    original.eligibility?.detail,
    original.booking?.detail,
    ...(original.highlights || []),
    ...(original.description || []),
    ...(original.tags || [])
  ].join(" ").toLocaleLowerCase();
}

export function lowestPrice(listing, searchText) {
  if (listing.costType === "free") return 0;
  if (/free|무료/i.test(searchText)) return 0;
  const amounts = [...searchText.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
  return amounts.length ? Math.min(...amounts) : Number.POSITIVE_INFINITY;
}

export function matchesIntent(listing, intent, context) {
  const { now = new Date(), searchText, minimumPrice, timeZone = DFW_TIME_ZONE } = context;
  if (intent === "events") return listing.kind === "event";
  if (intent === "benefits") return listing.kind === "benefit";
  if (intent === "today") return overlapsWindow(listing, dayWindow(now, 0, timeZone));
  if (intent === "tomorrow") return overlapsWindow(listing, dayWindow(now, 1, timeZone));
  if (intent === "weekend") return overlapsWindow(listing, weekendWindow(now, timeZone));
  if (intent === "tonight") return overlapsWindow(listing, tonightWindow(now, timeZone));
  if (intent === "free") return minimumPrice === 0;
  if (intent === "under5") return minimumPrice <= 5;
  if (intent === "under10") return minimumPrice <= 10;
  if (intent === "kids") return listing.category === "family" || /아이와|가족|전 연령|키즈|kids?|family|all ages/.test(searchText);
  if (intent === "date") return /라이브 음악|재즈|예술|갤러리|영화|성인|콘서트|축제|마켓|live music|jazz|art|gallery|film|adult|concert|festival|market/.test(searchText);
  if (intent === "outdoor") return listing.category === "outdoors" || /야외|공원|정원|트레일|outdoors?|park|garden|trail/.test(searchText);
  if (intent === "indoor") return /실내|박물관|갤러리|도서관|전시|indoors?|museum|gallery|library|exhibit/.test(searchText);
  if (intent === "food") return /음식|푸드|먹|푸드 트럭|food|eat|restaurant|happy hour/.test(searchText);
  if (intent === "museums") return /박물관|미술관|갤러리|전시|museum|gallery|exhibit/.test(searchText);
  if (intent === "festivals") return listing.category === "festival" || /축제|페스티벌|festival|fest/.test(searchText);
  return true;
}

export function createDiscoveryIndex(listings, localize) {
  const originalById = new Map(listings.map((listing) => [listing.id, listing]));
  const cityCounts = new Map();
  for (const listing of listings) cityCounts.set(listing.city, (cityCounts.get(listing.city) || 0) + 1);
  const localized = listings.map(localize);
  const records = localized.map((listing) => {
    const searchText = buildSearchText(listing, originalById.get(listing.id));
    return {
      listing,
      searchText,
      minimumPrice: lowestPrice(listing, searchText)
    };
  });
  return {
    originalById,
    cityCounts,
    records,
    recordById: new Map(records.map((record) => [record.listing.id, record]))
  };
}
