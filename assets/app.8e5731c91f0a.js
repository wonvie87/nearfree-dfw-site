import { CITY_PRESETS, LISTINGS, RESEARCH_NOTE } from "./data.9880fdf73d13.js";
import { UI, localizeListing } from "./locales.37c04ae2a7e5.js";
import {
  createDiscoveryIndex,
  calendarDayDifference,
  dateKeyInTimeZone,
  dayWindow,
  DFW_TIME_ZONE,
  distanceMiles,
  isRecentlyVerified,
  matchesIntent,
  overlapsWindow,
} from "./discovery.d93910c29cef.js";
import { createBrowserStorage } from "./browser-storage.aba7afe3e62a.js";
import { createListingTemplates } from "./listing-templates.8bcda709033c.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const storage = createBrowserStorage();
const storedLocationValue = storage.readJson("nearfree-location");
const storedSaved = storage.readJson("nearfree-saved");
const storedLocale = storage.read("nearfree-locale");
const storedScope = storage.read("nearfree-scope");
const storedRadarValue = storage.readJson("nearfree-radar-preview");
const initialUrl = new URL(window.location.href);
const requestedView = initialUrl.searchParams.get("view");
const CATALOG_VIEWS = new Set(["all", "events", "benefits", "recent"]);
const EVENT_TIME_INTENTS = new Set(["today", "tonight", "tomorrow", "weekend"]);
const initialCatalogView = CATALOG_VIEWS.has(requestedView) ? requestedView : "all";

function catalogViewDefaultSort(view, scope) {
  if (view === "benefits") return scope === "all" ? "city" : "distance";
  if (view === "recent") return "verified";
  return "soon";
}

const storedLocationName =
  typeof storedLocationValue === "string" ? storedLocationValue : storedLocationValue?.name;
const storedLocation = CITY_PRESETS.find((city) => city.name === storedLocationName) || null;
const hasValidStoredScope =
  storedScope === "all" || (Boolean(storedLocation) && ["city", "nearby"].includes(storedScope));
const initialScope = hasValidStoredScope ? storedScope : storedLocation ? "nearby" : "all";
const radarCityName = CITY_PRESETS.some((city) => city.name === storedRadarValue?.city)
  ? storedRadarValue.city
  : storedLocation?.name || CITY_PRESETS[0].name;
const radarRadius = [10, 20, 35].includes(Number(storedRadarValue?.radius))
  ? Number(storedRadarValue.radius)
  : 20;
const radarInterestKeys = new Set(["family", "culture", "food", "active"]);
const storedRadarInterests = Array.isArray(storedRadarValue?.interests)
  ? storedRadarValue.interests.filter((interest) => radarInterestKeys.has(interest))
  : [];

// Older versions stored precise coordinates. Normalize them to a city name on load.
if (storedLocationValue !== null && storedLocation) {
  storage.writeJson("nearfree-location", storedLocation.name);
}

const state = {
  location: storedLocation || CITY_PRESETS[0],
  scope: initialScope,
  catalogView: initialCatalogView,
  intents: new Set(),
  sort: catalogViewDefaultSort(initialCatalogView, initialScope),
  search: "",
  saved: new Set(Array.isArray(storedSaved) ? storedSaved : []),
  savedOnly: initialUrl.searchParams.get("saved") === "1",
  locale: ["en", "ko"].includes(storedLocale) ? storedLocale : "en",
  radar: {
    city: radarCityName,
    radius: radarRadius,
    interests: new Set(storedRadarInterests),
    saved: Boolean(storedRadarValue),
  },
};

const elements = {
  feed: $("#feed"),
  resultCount: $("#resultCount"),
  emptyState: $("#emptyState"),
  locationModeLabel: $("#locationModeLabel"),
  locationName: $("#locationName"),
  homeLocationName: $("#homeLocationName"),
  locationDialog: $("#locationDialog"),
  locationStatus: $("#locationStatus"),
  cityGrid: $("#cityGrid"),
  allDfwOption: $("#allDfwOption"),
  nearbyCities: $("#nearbyCities"),
  nearbyCitiesTitle: $("#nearbyCitiesTitle"),
  detailDialog: $("#detailDialog"),
  detailScrollArea: $("#detailScrollArea"),
  detailContent: $("#detailContent"),
  detailSave: $("#detailSave"),
  detailShare: $("#detailShare"),
  sortDialog: $("#sortDialog"),
  filterDialog: $("#filterDialog"),
  filterResultCount: $("#filterResultCount"),
  filterCount: $("#filterCount"),
  resultTypeLabel: $("#resultTypeLabel"),
  modalBackdrop: $("#modalBackdrop"),
  searchInput: $("#searchInput"),
  searchClear: $("#searchClear"),
  savedCount: $("#savedCount"),
  activeNotice: $("#activeNotice"),
  activeNoticeText: $("#activeNoticeText"),
  sortLabel: $("#sortLabel"),
  toast: $("#toast"),
  languageSelect: $("#languageSelect"),
  updatedLabel: $("#updatedLabel"),
  radarAvailableCount: $("#radarAvailableCount"),
  radarNewCount: $("#radarNewCount"),
  radarEndingCount: $("#radarEndingCount"),
  radarCityCount: $("#radarCityCount"),
  radarCitySelect: $("#radarCitySelect"),
  radarRadiusSelect: $("#radarRadiusSelect"),
  radarMatchCount: $("#radarMatchCount"),
  radarBenefitCount: $("#radarBenefitCount"),
  radarEventCount: $("#radarEventCount"),
  radarPreviewArea: $("#radarPreviewArea"),
  radarMatches: $("#radarMatches"),
  radarPreviewStatus: $("#radarPreviewStatus"),
};

let toastTimer;
let detailOriginScrollY = null;
const discoveryIndexes = new Map();
const RADAR_INTEREST_CATEGORIES = Object.freeze({
  family: ["family"],
  culture: ["arts", "culture", "concert", "festival", "library"],
  food: ["food", "local-deals"],
  active: ["fitness", "recreation", "transit"],
});

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function t(key, variables = {}) {
  const template = UI[state.locale][key] ?? UI.en[key] ?? key;
  return Object.entries(variables).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

function translatedListing(listing) {
  return localizeListing(listing, state.locale);
}

function discoveryIndex() {
  if (!discoveryIndexes.has(state.locale)) {
    const locale = state.locale;
    discoveryIndexes.set(
      locale,
      createDiscoveryIndex(LISTINGS, (listing) => localizeListing(listing, locale)),
    );
  }
  return discoveryIndexes.get(state.locale);
}

function sourceListing(id) {
  return discoveryIndex().originalById.get(id) || null;
}

function formatVerifiedDate(value) {
  const locale = state.locale === "ko" ? "ko-KR" : "en-US";
  const timeZone = String(value).includes("T") ? DFW_TIME_ZONE : "UTC";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(String(value).includes("T") ? value : `${value}T00:00:00Z`));
}

function applyStaticTranslations() {
  document.documentElement.lang = state.locale;
  document.title = t(document.body.dataset.titleKey || "metaTitle");
  const metaDescription = $("meta[name='description']");
  if (metaDescription) {
    metaDescription.content = t(document.body.dataset.descriptionKey || "metaDescription");
  }
  $$("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  $$("[data-i18n-aria]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  });
  $$("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
  $$("[data-i18n-alt]").forEach((node) => {
    node.setAttribute("alt", t(node.dataset.i18nAlt));
  });
  if (elements.updatedLabel) {
    elements.updatedLabel.textContent = t("updated", {
      date: formatVerifiedDate(RESEARCH_NOTE.verifiedAt),
    });
  }
  if (elements.languageSelect) elements.languageSelect.value = state.locale;
  updateSortLabel();
}

function sortTranslationKey(sort = state.sort) {
  return {
    city: "sortCity",
    distance: "sortDistance",
    soon: "sortSoon",
    verified: "sortVerified",
  }[sort];
}

function updateSortLabel() {
  if (elements.sortLabel) {
    elements.sortLabel.textContent = t(sortTranslationKey());
  }
}

function isCurrentListing(listing, now = new Date()) {
  return !listing.end || new Date(listing.end) >= now;
}

function isHappeningNow(listing, now = new Date()) {
  return (
    listing.kind === "event" &&
    new Date(listing.start) <= now &&
    (!listing.end || new Date(listing.end) >= now)
  );
}

function endsWithin(listing, days, now = new Date()) {
  if (!listing.end) return false;
  const remaining = new Date(listing.end) - now;
  return remaining >= 0 && remaining <= days * 86_400_000;
}

function radarSignal(listing, now = new Date()) {
  if (listing.kind === "event") {
    if (isHappeningNow(listing, now)) {
      return { key: "radarHappeningSignal", className: "signal-happening" };
    }
    return { key: "radarUpcomingSignal", className: "signal-upcoming" };
  }
  if (endsWithin(listing, 30, now)) {
    return { key: "radarEndingSignal", className: "signal-ending" };
  }
  if (isRecentlyVerified(listing, now)) {
    return { key: "radarNewSignal", className: "signal-new" };
  }
  return { key: "radarAvailableSignal", className: "signal-available" };
}

function renderRadarMetrics() {
  if (!elements.radarAvailableCount) return;
  const now = new Date();
  const current = LISTINGS.filter((listing) => isCurrentListing(listing, now));
  elements.radarAvailableCount.textContent = current.length;
  elements.radarNewCount.textContent = current.filter((listing) =>
    isRecentlyVerified(listing, now),
  ).length;
  elements.radarEndingCount.textContent = current.filter((listing) =>
    endsWithin(listing, 30, now),
  ).length;
  elements.radarCityCount.textContent = new Set(current.map((listing) => listing.city)).size;
}

function renderRadarCityOptions() {
  if (!elements.radarCitySelect || !elements.radarRadiusSelect) return;
  elements.radarCitySelect.innerHTML = CITY_PRESETS.map(
    (city) => `
    <option value="${escapeHtml(city.name)}" ${city.name === state.radar.city ? "selected" : ""}>${escapeHtml(city.name)}</option>`,
  ).join("");
  elements.radarRadiusSelect.value = String(state.radar.radius);
}

function currentRadarMatches() {
  const now = new Date();
  const city = CITY_PRESETS.find((item) => item.name === state.radar.city) || CITY_PRESETS[0];
  const categories = new Set(
    [...state.radar.interests].flatMap((interest) => RADAR_INTEREST_CATEGORIES[interest] || []),
  );
  return LISTINGS.filter((listing) => isCurrentListing(listing, now))
    .map((listing) => ({
      listing: translatedListing(listing),
      distance: distanceMiles(city, listing),
    }))
    .filter(
      ({ listing, distance }) =>
        distance <= state.radar.radius &&
        (categories.size === 0 || categories.has(listing.category)),
    )
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        Number(a.listing.kind !== "event") - Number(b.listing.kind !== "event") ||
        new Date(a.listing.start) - new Date(b.listing.start),
    );
}

function renderRadarPreview() {
  if (!elements.radarMatches) return;
  const matches = currentRadarMatches();
  const now = new Date();
  elements.radarMatchCount.textContent = matches.length;
  elements.radarBenefitCount.textContent = matches.filter(
    ({ listing }) => listing.kind === "benefit",
  ).length;
  elements.radarEventCount.textContent = matches.filter(
    ({ listing }) => listing.kind === "event",
  ).length;
  elements.radarPreviewArea.textContent = `${state.radar.city} · ${formatDistance(state.radar.radius)}`;
  elements.radarPreviewStatus.textContent = t(
    state.radar.saved ? "previewSaved" : "previewNotSubscribed",
  );
  $$("[data-radar-interest]").forEach((button) => {
    const active = state.radar.interests.has(button.dataset.radarInterest);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.radarMatches.innerHTML = matches.length
    ? matches
        .slice(0, 3)
        .map(({ listing, distance }) => {
          const signal = radarSignal(listing, now);
          return `
      <button class="radar-match-item" data-radar-listing="${escapeHtml(listing.id)}" type="button">
        <span class="radar-match-signal ${signal.className}">${escapeHtml(t(signal.key))}</span>
        <strong>${escapeHtml(listing.title)}</strong>
        <small>${escapeHtml(displayCost(listing))} · ${escapeHtml(formatDistance(distance))} · ${escapeHtml(listing.dateLabel)}</small>
        <span aria-hidden="true">→</span>
      </button>`;
        })
        .join("")
    : `<p class="radar-empty-match">${escapeHtml(t("radarEmptyMatches"))}</p>`;
}

function renderRadarExperience() {
  renderRadarMetrics();
  renderRadarPreview();
}

function scrollToRadarPreview() {
  const radarPreview = $("#radarPreview");
  if (!radarPreview) {
    window.location.href = "radar.html";
    return;
  }
  radarPreview.scrollIntoView({ behavior: "smooth", block: "start" });
  requestAnimationFrame(() => elements.radarCitySelect?.focus({ preventScroll: true }));
}

function saveRadarPreview() {
  storage.writeJson("nearfree-radar-preview", {
    city: state.radar.city,
    radius: state.radar.radius,
    interests: [...state.radar.interests],
  });
  state.radar.saved = true;
  elements.radarPreviewStatus.textContent = t("previewSaved");
  showToast(t("previewSaved"));
}

function formatDistance(miles) {
  if (miles < 0.3) return t("within");
  if (miles < 10) return t("distanceMiles", { distance: miles.toFixed(1) });
  return t("distanceMiles", { distance: Math.round(miles) });
}

function getTimeStatus(listing) {
  if (listing.kind === "benefit") return t("ongoingBenefit");
  const now = new Date();
  const start = new Date(listing.start);
  const end = listing.end ? new Date(listing.end) : null;
  if (end && now > end) return t("ended");
  if (listing.kind === "ongoing" && start <= now) return t("availableNow");
  if (overlapsWindow(listing, dayWindow(now))) return t("today");
  if (overlapsWindow(listing, dayWindow(now, 1))) return t("tomorrow");
  const diff = calendarDayDifference(now, start);
  if (diff <= 7) return t("daysAway", { count: diff });
  if (diff <= 31) return t("weeksAway", { count: Math.ceil(diff / 7) });
  return String(listing.kicker || listing.dateLabel)
    .split("·")[0]
    .trim();
}

function listingMatches(record, now) {
  const { listing, searchText, minimumPrice } = record;
  if (state.savedOnly && !state.saved.has(listing.id)) return false;
  if (state.catalogView === "events" && listing.kind !== "event") return false;
  if (state.catalogView === "benefits" && listing.kind !== "benefit") {
    return false;
  }
  if (state.catalogView === "recent" && !isRecentlyVerified(listing, now)) {
    return false;
  }
  if (state.scope === "city" && listing.city !== state.location.name) {
    return false;
  }
  if (
    ![...state.intents].every((intent) =>
      matchesIntent(listing, intent, { now, searchText, minimumPrice }),
    )
  ) {
    return false;
  }

  if (state.search) {
    if (!searchText.includes(state.search.toLocaleLowerCase(state.locale))) {
      return false;
    }
  }
  return true;
}

function sortedListings() {
  const now = new Date();
  const results = discoveryIndex()
    .records.filter((record) => listingMatches(record, now))
    .map(({ listing }) => ({
      ...listing,
      distance: distanceMiles(state.location, listing),
    }));

  const byCityAndTitle = (a, b) =>
    a.city.localeCompare(b.city, state.locale) || a.title.localeCompare(b.title, state.locale);

  if (state.sort === "soon") {
    results.sort((a, b) => {
      const aRank = a.kind === "event" ? 0 : 1;
      const bRank = b.kind === "event" ? 0 : 1;
      const fallback = state.scope === "all" ? byCityAndTitle(a, b) : a.distance - b.distance;
      if (aRank !== bRank) return aRank - bRank;
      if (a.kind === "event") {
        return new Date(a.start) - new Date(b.start) || fallback;
      }
      return fallback || a.title.localeCompare(b.title, state.locale);
    });
  } else if (state.sort === "verified") {
    results.sort(
      (a, b) =>
        new Date(b.verifiedAt) - new Date(a.verifiedAt) ||
        (state.scope === "all" ? byCityAndTitle(a, b) : a.distance - b.distance),
    );
  } else if (state.sort === "city") {
    results.sort((a, b) => byCityAndTitle(a, b) || new Date(a.start) - new Date(b.start));
  } else {
    results.sort((a, b) => a.distance - b.distance || new Date(a.start) - new Date(b.start));
  }
  return results;
}

function compactCost(listing) {
  if (listing.costType === "free") return displayCost(listing);
  const cost = listing.cost.split("·")[0].split(",")[0].trim();
  return cost;
}

function displayCost(listing) {
  return listing.costType === "free" ? t("valueFreeLabel") : listing.cost;
}

function verificationAge(value) {
  const hasTime = String(value).includes("T");
  const checked = new Date(hasTime ? value : `${value}T00:00:00Z`);
  const today = new Date();
  if (hasTime) {
    const hours = Math.floor((today - checked) / 3_600_000);
    if (hours >= 0 && hours < 1) return t("verifiedRecently");
    if (hours >= 1 && hours < 24) {
      return t("verifiedHoursAgo", { count: hours });
    }
  }
  const checkedKey = hasTime ? dateKeyInTimeZone(checked) : String(value).slice(0, 10);
  const todayKey = dateKeyInTimeZone(today);
  const days = Math.round(
    (Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${checkedKey}T00:00:00Z`)) / 86400000,
  );
  if (days <= 0) return t("verifiedToday");
  if (days === 1) return t("verifiedYesterday");
  return t("verifiedOn", { date: formatVerifiedDate(value) });
}

function monthKey(value) {
  return String(value).slice(0, 7);
}

function formatCatalogMonth(key) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(state.locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function eventCatalogSections(listings, now) {
  const events = listings.filter((listing) => listing.kind === "event");
  const happening = events.filter((listing) => isHappeningNow(listing, now));
  const scheduled = events.filter((listing) => !isHappeningNow(listing, now));
  const grouped = new Map();
  for (const listing of scheduled) {
    const key = monthKey(listing.start);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(listing);
  }
  return [
    happening.length ? { key: "happening", items: happening, total: happening.length } : null,
    ...[...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, items]) => ({
        key: `month-${key}`,
        title: formatCatalogMonth(key),
        description: t("sectionEventCount", { count: items.length }),
        items,
        total: items.length,
        variant: "month",
      })),
  ].filter(Boolean);
}

function catalogSections(listings, now = new Date()) {
  const filteredMode = state.savedOnly || Boolean(state.search) || state.intents.size > 0;
  if (filteredMode && state.catalogView === "all") {
    return [{ key: "results", items: listings, total: listings.length }];
  }

  if (state.catalogView === "events") {
    return eventCatalogSections(listings, now);
  }

  if (state.catalogView === "benefits") {
    return [
      {
        key: "ongoing",
        items: listings.filter((listing) => listing.kind === "benefit"),
        total: listings.length,
      },
    ];
  }

  if (state.catalogView === "recent") {
    return [{ key: "recent", items: listings, total: listings.length }];
  }

  const events = listings.filter((listing) => listing.kind === "event");
  const benefits = listings.filter((listing) => listing.kind === "benefit");
  const recent = listings
    .filter((listing) => isRecentlyVerified(listing, now))
    .sort((left, right) => new Date(right.verifiedAt) - new Date(left.verifiedAt));
  const recentIds = new Set(recent.map((listing) => listing.id));
  const remainingEvents = events.filter((listing) => !recentIds.has(listing.id));
  const remainingBenefits = benefits.filter((listing) => !recentIds.has(listing.id));
  const happening = remainingEvents.filter((listing) => isHappeningNow(listing, now));
  const happeningIds = new Set(happening.map((listing) => listing.id));
  const upcoming = remainingEvents.filter((listing) => !happeningIds.has(listing.id));
  return [
    recent.length
      ? {
          key: "recent",
          items: recent.slice(0, 6),
          total: recent.length,
        }
      : null,
    happening.length
      ? {
          key: "happening",
          items: happening.slice(0, 2),
          total: happening.length,
          catalogView: "events",
        }
      : null,
    upcoming.length
      ? {
          key: "upcoming",
          items: upcoming.slice(0, 6),
          total: events.length,
          catalogView: "events",
        }
      : null,
    remainingBenefits.length
      ? {
          key: "ongoing",
          items: remainingBenefits.slice(0, 6),
          total: benefits.length,
          catalogView: "benefits",
        }
      : null,
  ].filter(Boolean);
}

function renderFeed() {
  if (!elements.feed) return;
  const listings = sortedListings();
  let startIndex = 0;
  elements.feed.innerHTML = catalogSections(listings)
    .map((section) => {
      const markup = templates.sectionTemplate(section, startIndex);
      startIndex += section.items.length;
      return markup;
    })
    .join("");
  elements.resultCount.textContent = listings.length;
  if (elements.filterResultCount) {
    elements.filterResultCount.textContent = listings.length;
  }
  elements.emptyState.hidden = listings.length > 0;
  elements.feed.hidden = listings.length === 0;
  updateCatalogViewUI();
  updateActiveNotice();
  updateIntentUI();
  updateSavedCount();
  renderNearbyCities();
}

function updateActiveNotice() {
  if (!elements.activeNotice || !elements.activeNoticeText) return;
  const notices = [];
  if (state.scope === "city") {
    notices.push({
      key: "scope",
      label: t("cityOnly", {
        city: state.location.label || state.location.name,
      }),
    });
  }
  if (state.scope === "nearby") {
    notices.push({
      key: "scope",
      label: t("sortedNear", {
        city: state.location.label || state.location.name,
      }),
    });
  }
  if (state.savedOnly) {
    notices.push({ key: "saved", label: t("savedOnly") });
  }
  if (state.search) {
    notices.push({
      key: "search",
      label: t("searchResults", { query: state.search }),
    });
  }
  state.intents.forEach((intent) => {
    const chip = $(`[data-intent="${intent}"]`);
    if (chip) {
      notices.push({ key: `intent:${intent}`, label: chip.textContent.trim() });
    }
  });
  elements.activeNotice.hidden = notices.length === 0;
  elements.activeNoticeText.innerHTML = notices
    .map(
      ({ key, label }) =>
        `<button type="button" data-remove-filter="${escapeHtml(key)}" aria-label="${escapeHtml(t("removeFilter", { filter: label }))}"><span>${escapeHtml(label)}</span><span aria-hidden="true">×</span></button>`,
    )
    .join("");
}

function updateIntentUI() {
  $$(".intent-chip, .quick-intent").forEach((chip) => {
    const group = chip.dataset.clearGroup;
    const active = chip.dataset.intent
      ? state.intents.has(chip.dataset.intent)
      : group
        ? !$$(`[data-intent-group="${group}"]`).some((item) =>
            state.intents.has(item.dataset.intent),
          )
        : false;
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-pressed", String(active));
  });
  if (elements.filterCount) {
    elements.filterCount.textContent = state.intents.size;
    elements.filterCount.hidden = state.intents.size === 0;
  }
}

function updateCatalogViewUI() {
  $$(".catalog-view-option[data-catalog-view]").forEach((button) => {
    const active = button.dataset.catalogView === state.catalogView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (elements.resultTypeLabel) {
    elements.resultTypeLabel.textContent = t(
      {
        all: "resultsSuffix",
        benefits: "resultsBenefitsSuffix",
        events: "resultsEventsSuffix",
        recent: "resultsRecentSuffix",
      }[state.catalogView],
    );
  }
  $$("[data-quick-event-filter]").forEach((filter) =>
    filter.toggleAttribute("hidden", state.catalogView === "benefits"),
  );
  $("#whenFilterGroup")?.toggleAttribute("hidden", state.catalogView === "benefits");
}

function syncCatalogViewQuery() {
  const url = new URL(window.location.href);
  if (state.catalogView !== "all") {
    url.searchParams.set("view", state.catalogView);
  } else {
    url.searchParams.delete("view");
  }
  history.replaceState(history.state, "", url);
}

function defaultSortForCatalogView(view = state.catalogView) {
  return catalogViewDefaultSort(view, state.scope);
}

function setCatalogView(view, { moveFocus = false } = {}) {
  if (!CATALOG_VIEWS.has(view) || view === state.catalogView) return;
  state.catalogView = view;
  if (view === "benefits") {
    EVENT_TIME_INTENTS.forEach((intent) => state.intents.delete(intent));
  }
  state.sort = defaultSortForCatalogView(view);
  syncCatalogViewQuery();
  updateSortLabel();
  renderFeed();
  if (moveFocus) {
    $("#resultsToolbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() =>
      $(`.catalog-view-option[data-catalog-view="${view}"]`)?.focus({
        preventScroll: true,
      }),
    );
  }
}

function toggleIntentFilter(chip) {
  const intent = chip.dataset.intent;
  const group = chip.dataset.intentGroup || chip.dataset.clearGroup;
  $$(`[data-intent-group="${group}"]`).forEach((item) => state.intents.delete(item.dataset.intent));
  if (intent && chip.getAttribute("aria-pressed") !== "true") {
    state.intents.add(intent);
  }
  renderFeed();
}

function removeActiveFilter(key) {
  if (key === "scope") {
    state.scope = "all";
    if (state.sort === "distance") {
      state.sort = defaultSortForCatalogView();
    }
    updateSortLabel();
    persistArea();
    updateLocationUI();
  } else if (key === "saved") {
    state.savedOnly = false;
  } else if (key === "search") {
    state.search = "";
    if (elements.searchInput) elements.searchInput.value = "";
    if (elements.searchClear) elements.searchClear.hidden = true;
  } else if (key.startsWith("intent:")) {
    state.intents.delete(key.slice("intent:".length));
  }
  renderFeed();
}

function updateSavedCount() {
  if (!elements.savedCount) return;
  const count = state.saved.size;
  elements.savedCount.textContent = count;
  elements.savedCount.hidden = count === 0;
}

function updateLocationUI() {
  if (!elements.locationName) return;
  if (state.scope === "all") {
    if (elements.locationModeLabel) {
      elements.locationModeLabel.textContent = t("browseArea");
    }
    elements.locationName.textContent = t("allDfw");
    if (elements.homeLocationName) {
      elements.homeLocationName.textContent = t("allDfw");
    }
  } else {
    const isPreset = CITY_PRESETS.some(
      (city) => city.lat === state.location.lat && city.lng === state.location.lng,
    );
    const label = isPreset
      ? state.location.label || state.location.name
      : t("currentNear", { city: state.location.name });
    if (elements.locationModeLabel) {
      elements.locationModeLabel.textContent =
        state.scope === "city" ? t("cityFilter") : t("nearby");
    }
    elements.locationName.textContent = label;
    if (elements.homeLocationName) {
      elements.homeLocationName.textContent = label;
    }
  }
  elements.allDfwOption?.classList.toggle("active", state.scope === "all");
  elements.allDfwOption?.setAttribute("aria-pressed", String(state.scope === "all"));
  $$(".city-button", elements.cityGrid || document).forEach((button) => {
    const active = state.scope === "city" && button.dataset.city === state.location.name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderCityGrid() {
  if (!elements.cityGrid) return;
  elements.cityGrid.innerHTML = CITY_PRESETS.map((city) => {
    const count = discoveryIndex().cityCounts.get(city.name) || 0;
    const active = state.scope === "city" && city.name === state.location.name;
    return `
      <button class="city-button ${active ? "active" : ""}" data-city="${escapeHtml(city.name)}" type="button" aria-pressed="${active}" aria-label="${escapeHtml(t("cityButtonLabel", { city: city.name, count }))}" ${count === 0 ? "disabled" : ""}>
        <strong>${escapeHtml(city.name)}</strong><small>${escapeHtml(t("benefitsCount", { count }))}</small>
      </button>`;
  }).join("");
}

function renderNearbyCities() {
  if (!elements.nearbyCities || !elements.nearbyCitiesTitle) return;
  const nearby = CITY_PRESETS.filter(
    (city) => state.scope === "all" || city.name !== state.location.name,
  )
    .map((city) => ({
      ...city,
      distance: distanceMiles(state.location, city),
      count: discoveryIndex().cityCounts.get(city.name) || 0,
    }))
    .filter((city) => city.count > 0)
    .sort((a, b) =>
      state.scope === "all"
        ? b.count - a.count || a.name.localeCompare(b.name)
        : a.distance - b.distance,
    )
    .slice(0, 5);

  elements.nearbyCitiesTitle.textContent = t(
    state.scope === "all" ? "browseCities" : "nearbyCities",
  );
  elements.nearbyCities.innerHTML = nearby
    .map(
      (city) => `
    <button class="nearby-city" data-city="${escapeHtml(city.name)}" type="button">
      <span><strong>${escapeHtml(city.name)}</strong><small>${state.scope === "all" ? "" : `${escapeHtml(formatDistance(city.distance))} · `}${escapeHtml(t("benefitsCount", { count: city.count }))}</small></span>
      <span>${escapeHtml(t("view"))}</span>
    </button>
  `,
    )
    .join("");
}

function persistArea() {
  storage.write("nearfree-scope", state.scope);
  if (state.scope !== "all") {
    storage.writeJson("nearfree-location", state.location.name);
  }
}

function selectAllDfw() {
  state.scope = "all";
  if (state.sort === "distance") state.sort = defaultSortForCatalogView();
  persistArea();
  applyStaticTranslations();
  updateLocationUI();
  renderFeed();
  closeDialogs();
  showToast(t("allDfwSelected"));
}

function selectCity(name) {
  const city = CITY_PRESETS.find((item) => item.name === name);
  if (!city) return;
  state.location = city;
  state.scope = "city";
  if (state.catalogView === "benefits") state.sort = "distance";
  state.radar.city = city.name;
  state.radar.saved = false;
  persistArea();
  updateSortLabel();
  updateLocationUI();
  renderFeed();
  renderRadarCityOptions();
  renderRadarPreview();
  closeDialogs();
  showToast(t("citySelected", { city: city.label || city.name }));
}

function nearestCity(location) {
  return CITY_PRESETS.map((city) => ({
    ...city,
    distance: distanceMiles(location, city),
  })).sort((a, b) => a.distance - b.distance)[0];
}

function useCurrentLocation() {
  openDialog(elements.locationDialog);
  if (!navigator.geolocation) {
    elements.locationStatus.textContent = t("geoUnsupported");
    return;
  }
  const button = $("#detectLocation");
  button.disabled = true;
  elements.locationStatus.textContent = t("locating");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const exact = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      const nearest = nearestCity(exact);
      state.location = { name: nearest.name, isCurrent: true, ...exact };
      state.scope = "nearby";
      state.sort = "distance";
      state.radar.city = nearest.name;
      state.radar.saved = false;
      persistArea();
      applyStaticTranslations();
      updateLocationUI();
      renderFeed();
      renderRadarCityOptions();
      renderRadarPreview();
      button.disabled = false;
      elements.locationStatus.textContent = t("located");
      setTimeout(closeDialogs, 600);
      showToast(t("locationSorted"));
    },
    (error) => {
      button.disabled = false;
      const message = error.code === 1 ? t("locationDenied") : t("locationFailed");
      elements.locationStatus.textContent = message;
    },
    { enableHighAccuracy: false, timeout: 9000, maximumAge: 300000 },
  );
}

function mapUrl(listing) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${listing.venue}, ${listing.address}`)}`;
}

function similarListings(listing) {
  return LISTINGS.filter((item) => item.id !== listing.id)
    .map((item) => {
      const translated = translatedListing(item);
      const nearbyDistance = distanceMiles(listing, item);
      const categoryRank = item.category === listing.category ? 0 : 1;
      const costRank = item.costType === listing.costType ? 0 : 1;
      return { ...translated, nearbyDistance, categoryRank, costRank };
    })
    .sort(
      (a, b) =>
        a.categoryRank - b.categoryRank ||
        a.costRank - b.costRank ||
        a.nearbyDistance - b.nearbyDistance,
    )
    .slice(0, 3);
}

const templates = createListingTemplates({
  compactCost,
  escapeHtml,
  formatDistance,
  getTimeStatus,
  isAllDfw: () => state.scope === "all",
  isEndingSoon: (listing) => endsWithin(listing, 30),
  isSaved: (id) => state.saved.has(id),
  mapUrl,
  similarListings,
  t,
  verificationAge,
  distanceFromSelected: (listing) => distanceMiles(state.location, listing),
});

function updateDetailControls(listing = null) {
  if (!elements.detailSave || !elements.detailShare) return;
  const hasListing = Boolean(listing);
  elements.detailSave.hidden = !hasListing;
  elements.detailShare.hidden = !hasListing;
  if (!listing) {
    delete elements.detailSave.dataset.id;
    delete elements.detailShare.dataset.id;
    return;
  }
  const saved = state.saved.has(listing.id);
  elements.detailSave.dataset.id = listing.id;
  elements.detailShare.dataset.id = listing.id;
  elements.detailSave.classList.toggle("saved", saved);
  elements.detailSave.setAttribute("aria-label", saved ? t("unsave") : t("save"));
  elements.detailShare.setAttribute("aria-label", t("share"));
}

function renderListingDetail(listing) {
  if (!elements.detailContent) return;
  const localized = translatedListing(listing);
  updateDetailControls(listing);
  elements.detailContent.innerHTML = templates.detailTemplate(localized);
  document.title = `${localized.title} | NearFree DFW`;
  $("meta[name='description']").content = localized.overview || localized.summary;
}

function openDetails(id) {
  const listing = sourceListing(id);
  if (!listing) return;
  if (!elements.detailDialog) {
    window.location.href = `explore.html?listing=${encodeURIComponent(id)}`;
    return;
  }
  const wasOpen = Boolean(elements.detailDialog.open);
  if (!wasOpen) detailOriginScrollY = window.scrollY;
  renderListingDetail(listing);
  openDialog(elements.detailDialog);
  const url = new URL(window.location.href);
  if (url.searchParams.get("listing") !== id) {
    url.searchParams.set("listing", id);
    const routeState = {
      ...(history.state || {}),
      listing: id,
      nearfreeDetail: true,
    };
    if (wasOpen) history.replaceState(routeState, "", url);
    else history.pushState(routeState, "", url);
  }
}

function resetDetailScroll() {
  if (!elements.detailScrollArea) return;
  elements.detailScrollArea.scrollTop = 0;
  requestAnimationFrame(() => {
    elements.detailScrollArea.scrollTop = 0;
  });
}

function clearListingRoute() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("listing")) return;
  url.searchParams.delete("listing");
  const routeState = { ...(history.state || {}) };
  delete routeState.listing;
  delete routeState.nearfreeDetail;
  history.replaceState(routeState, "", url);
}

function restoreDetailOrigin() {
  if (detailOriginScrollY === null) return;
  const targetScrollY = detailOriginScrollY;
  detailOriginScrollY = null;
  requestAnimationFrame(() => window.scrollTo({ top: targetScrollY }));
}

function openDialog(dialog) {
  if (!dialog) return;
  closeDialogs({ clearRoute: false });
  if (elements.modalBackdrop) elements.modalBackdrop.hidden = false;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  if (dialog === elements.detailDialog) resetDetailScroll();
  document.body.classList.add("modal-open");
}

function closeDialogs({ clearRoute = true } = {}) {
  const closedDetail = Boolean(elements.detailDialog?.open);
  [
    elements.locationDialog,
    elements.detailDialog,
    elements.sortDialog,
    elements.filterDialog,
  ].forEach((dialog) => {
    if (dialog?.open) dialog.close();
    else dialog?.removeAttribute("open");
  });
  if (elements.modalBackdrop) elements.modalBackdrop.hidden = true;
  document.body.classList.remove("modal-open");
  if (clearRoute) clearListingRoute();
  if (closedDetail && clearRoute) applyStaticTranslations();
}

function requestCloseDialogs() {
  const url = new URL(window.location.href);
  if (elements.detailDialog?.open && url.searchParams.has("listing")) {
    if (history.state?.nearfreeDetail) {
      history.back();
      return;
    }
    clearListingRoute();
    closeDialogs({ clearRoute: false });
    applyStaticTranslations();
    restoreDetailOrigin();
    return;
  }
  closeDialogs();
}

function toggleSave(id) {
  if (state.saved.has(id)) {
    state.saved.delete(id);
    showToast(t("saveRemoved"));
  } else {
    state.saved.add(id);
    showToast(t("saveAdded"));
  }
  storage.writeJson("nearfree-saved", [...state.saved]);
  renderFeed();
  updateSavedCount();
}

async function shareListing(listing) {
  const url = new URL(window.location.href);
  url.searchParams.set("listing", listing.id);
  const shareData = {
    title: `${listing.title} | NearFree DFW`,
    text: `${displayCost(listing)} · ${listing.dateLabel}\n${listing.venue}, ${listing.city}\n${listing.actionUrl}`,
    url: url.href,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(
        `${shareData.title}\n${shareData.text}\n${shareData.url}`,
      );
      showToast(t("linkCopied"));
    }
  } catch (error) {
    if (error?.name !== "AbortError") showToast(t("shareFailed"));
  }
}

function showToast(message) {
  if (!elements.toast) return;
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

function resetFilters() {
  if (!elements.searchInput) return;
  state.scope = "all";
  state.catalogView = "all";
  state.sort = defaultSortForCatalogView("all");
  state.intents.clear();
  state.search = "";
  state.savedOnly = false;
  syncCatalogViewQuery();
  persistArea();
  elements.searchInput.value = "";
  elements.searchClear.hidden = true;
  applyStaticTranslations();
  updateLocationUI();
  renderFeed();
}

function setLocale(locale) {
  if (!["en", "ko"].includes(locale)) return;
  state.locale = locale;
  storage.write("nearfree-locale", locale);
  applyStaticTranslations();
  renderCityGrid();
  updateLocationUI();
  renderFeed();
  renderRadarCityOptions();
  renderRadarExperience();
}

function bindEvents() {
  elements.languageSelect?.addEventListener("change", (event) => setLocale(event.target.value));
  $("#locationButton")?.addEventListener("click", () => openDialog(elements.locationDialog));
  $("#homeLocationButton")?.addEventListener("click", () => openDialog(elements.locationDialog));
  $("#allCitiesButton")?.addEventListener("click", () => openDialog(elements.locationDialog));
  elements.allDfwOption?.addEventListener("click", selectAllDfw);
  $("#detectLocation")?.addEventListener("click", useCurrentLocation);

  $$("[data-scroll-radar]").forEach((button) =>
    button.addEventListener("click", scrollToRadarPreview),
  );
  elements.radarCitySelect?.addEventListener("change", (event) => {
    state.radar.city = event.target.value;
    state.radar.saved = false;
    renderRadarPreview();
  });
  elements.radarRadiusSelect?.addEventListener("change", (event) => {
    state.radar.radius = Number(event.target.value);
    state.radar.saved = false;
    renderRadarPreview();
  });
  $("#radarPreviewForm")?.addEventListener("submit", (event) => event.preventDefault());
  $(".radar-interest-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-radar-interest]");
    if (!button) return;
    const interest = button.dataset.radarInterest;
    if (state.radar.interests.has(interest)) {
      state.radar.interests.delete(interest);
    } else {
      state.radar.interests.add(interest);
    }
    state.radar.saved = false;
    renderRadarPreview();
  });
  $("#radarPreviewSave")?.addEventListener("click", saveRadarPreview);
  elements.radarMatches?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-radar-listing]");
    if (target) openDetails(target.dataset.radarListing);
  });
  elements.searchInput?.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    elements.searchClear.hidden = !state.search;
    renderFeed();
  });
  elements.searchClear?.addEventListener("click", () => {
    state.search = "";
    elements.searchInput.value = "";
    elements.searchClear.hidden = true;
    renderFeed();
    elements.searchInput.focus();
  });

  [$("#intentChips"), $("#quickIntentChips")].filter(Boolean).forEach((container) =>
    container.addEventListener("click", (event) => {
      const chip = event.target.closest(".intent-chip, .quick-intent");
      if (chip) toggleIntentFilter(chip);
    }),
  );
  $("#catalogViewSwitcher")?.addEventListener("click", (event) => {
    const option = event.target.closest(".catalog-view-option");
    if (option) setCatalogView(option.dataset.catalogView);
  });
  $("#allFiltersButton")?.addEventListener("click", () => openDialog(elements.filterDialog));
  $("#filterApply")?.addEventListener("click", closeDialogs);

  $("#sortButton")?.addEventListener("click", () => {
    $$("[data-sort]", elements.sortDialog).forEach((button) => {
      button.disabled =
        (button.dataset.sort === "distance" && state.scope === "all") ||
        (button.dataset.sort === "soon" && state.catalogView === "benefits");
      button.classList.toggle("active", button.dataset.sort === state.sort);
    });
    openDialog(elements.sortDialog);
  });
  elements.sortDialog?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    state.sort = button.dataset.sort;
    updateSortLabel();
    closeDialogs();
    renderFeed();
  });

  elements.feed?.addEventListener("click", (event) => {
    const catalogLink = event.target.closest("[data-catalog-view]");
    if (catalogLink) {
      setCatalogView(catalogLink.dataset.catalogView, { moveFocus: true });
      return;
    }
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const card = target.closest(".listing-card");
    const original = sourceListing(card?.dataset.id);
    if (!original) return;
    const listing = translatedListing(original);
    const action = target.dataset.action;
    if (action === "details") openDetails(listing.id);
    if (action === "save") toggleSave(listing.id);
  });
  elements.detailContent?.addEventListener("click", (event) => {
    const similar = event.target.closest("[data-similar-id]");
    if (similar) {
      openDetails(similar.dataset.similarId);
      elements.detailScrollArea?.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
  elements.detailSave?.addEventListener("click", () => {
    const listing = sourceListing(elements.detailSave.dataset.id);
    if (!listing) return;
    toggleSave(listing.id);
    updateDetailControls(listing);
  });
  elements.detailShare?.addEventListener("click", () => {
    const listing = sourceListing(elements.detailShare.dataset.id);
    if (listing) shareListing(translatedListing(listing));
  });
  elements.cityGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-city]");
    if (button) selectCity(button.dataset.city);
  });
  elements.nearbyCities?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-city]");
    if (button) selectCity(button.dataset.city);
  });

  const toggleSavedOnly = (event) => {
    if (!elements.feed) return;
    event?.preventDefault();
    if (state.saved.size === 0) {
      state.savedOnly = false;
      showToast(t("noSaved"));
      return;
    }
    state.savedOnly = !state.savedOnly;
    renderFeed();
    $("#resultsToolbar")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    showToast(state.savedOnly ? t("savedShown") : t("allShown"));
  };
  $("#savedButton")?.addEventListener("click", toggleSavedOnly);
  $("#mobileSaved")?.addEventListener("click", toggleSavedOnly);

  $("#clearAllFilters")?.addEventListener("click", resetFilters);
  elements.activeNotice?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-filter]");
    if (button) removeActiveFilter(button.dataset.removeFilter);
  });
  $("#emptyReset")?.addEventListener("click", resetFilters);
  elements.modalBackdrop?.addEventListener("click", requestCloseDialogs);
  $$("[data-close]").forEach((button) => button.addEventListener("click", requestCloseDialogs));
  [elements.locationDialog, elements.detailDialog, elements.sortDialog, elements.filterDialog]
    .filter(Boolean)
    .forEach((dialog) => {
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        requestCloseDialogs();
      });
    });
  window.addEventListener("popstate", () => {
    const id = new URL(window.location.href).searchParams.get("listing");
    if (id && sourceListing(id)) {
      const listing = sourceListing(id);
      renderListingDetail(listing);
      openDialog(elements.detailDialog);
    } else {
      closeDialogs({ clearRoute: false });
      applyStaticTranslations();
      restoreDetailOrigin();
    }
  });
}

function init() {
  applyStaticTranslations();
  renderCityGrid();
  renderRadarCityOptions();
  updateLocationUI();
  updateSavedCount();
  bindEvents();
  renderFeed();
  renderRadarExperience();
  if (state.savedOnly && state.saved.size === 0) {
    state.savedOnly = false;
    showToast(t("noSaved"));
  }
  const initialListingId = new URL(window.location.href).searchParams.get("listing");
  if (elements.detailDialog && initialListingId && sourceListing(initialListingId)) {
    const listing = sourceListing(initialListingId);
    history.replaceState(
      {
        ...(history.state || {}),
        listing: initialListingId,
        nearfreeDetail: false,
      },
      "",
      window.location.href,
    );
    renderListingDetail(listing);
    openDialog(elements.detailDialog);
  } else if (initialListingId) {
    clearListingRoute();
  }
}

init();
