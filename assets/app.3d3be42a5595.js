import { CITY_PRESETS, LISTINGS, RESEARCH_NOTE } from "./data.db03d5729418.js";
import { UI, localizeListing } from "./locales.081a9e71332d.js";
import {
  createDiscoveryIndex,
  calendarDayDifference,
  dateKeyInTimeZone,
  dayWindow,
  DFW_TIME_ZONE,
  distanceMiles,
  matchesIntent,
  overlapsWindow,
  weekendWindow
} from "./discovery.8226cf223dc3.js";
import { createBrowserStorage } from "./browser-storage.05ba53c5f819.js";
import { createListingTemplates } from "./listing-templates.b56390781bf4.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const storage = createBrowserStorage();
const storedLocationValue = storage.readJson("nearfree-location");
const storedSaved = storage.readJson("nearfree-saved");
const storedLocale = storage.read("nearfree-locale");
const storedScope = storage.read("nearfree-scope");
const storedLocationName = typeof storedLocationValue === "string"
  ? storedLocationValue
  : storedLocationValue?.name;
const storedLocation = CITY_PRESETS.find(city => city.name === storedLocationName) || null;
const hasValidStoredScope = storedScope === "all"
  || (Boolean(storedLocation) && ["city", "nearby"].includes(storedScope));
const initialScope = hasValidStoredScope ? storedScope : storedLocation ? "nearby" : "all";

// Older versions stored precise coordinates. Normalize them to a city name on load.
if (storedLocationValue !== null && storedLocation) {
  storage.writeJson("nearfree-location", storedLocation.name);
}

const state = {
  location: storedLocation || CITY_PRESETS[0],
  scope: initialScope,
  intents: new Set(),
  sort: initialScope === "all" ? "soon" : "distance",
  search: "",
  saved: new Set(Array.isArray(storedSaved) ? storedSaved : []),
  savedOnly: false,
  locale: ["en", "ko"].includes(storedLocale) ? storedLocale : "en"
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
  modalBackdrop: $("#modalBackdrop"),
  searchInput: $("#searchInput"),
  searchClear: $("#searchClear"),
  savedCount: $("#savedCount"),
  activeNotice: $("#activeNotice"),
  activeNoticeText: $("#activeNoticeText"),
  sortLabel: $("#sortLabel"),
  toast: $("#toast"),
  languageSelect: $("#languageSelect"),
  updatedLabel: $("#updatedLabel")
};

let toastTimer;
const discoveryIndexes = new Map();

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
    template
  );
}

function translatedListing(listing) {
  return localizeListing(listing, state.locale);
}

function discoveryIndex() {
  if (!discoveryIndexes.has(state.locale)) {
    const locale = state.locale;
    discoveryIndexes.set(locale, createDiscoveryIndex(LISTINGS, (listing) => localizeListing(listing, locale)));
  }
  return discoveryIndexes.get(state.locale);
}

function sourceListing(id) {
  return discoveryIndex().originalById.get(id) || null;
}

function formatVerifiedDate(value) {
  const locale = state.locale === "ko" ? "ko-KR" : "en-US";
  const timeZone = String(value).includes("T") ? DFW_TIME_ZONE : "UTC";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone })
    .format(new Date(String(value).includes("T") ? value : `${value}T00:00:00Z`));
}

function applyStaticTranslations() {
  document.documentElement.lang = state.locale;
  document.title = t("metaTitle");
  $("meta[name='description']").content = t("metaDescription");
  $$('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  $$('[data-i18n-aria]').forEach(node => { node.setAttribute("aria-label", t(node.dataset.i18nAria)); });
  $$('[data-i18n-placeholder]').forEach(node => { node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder)); });
  $$('[data-i18n-alt]').forEach(node => { node.setAttribute("alt", t(node.dataset.i18nAlt)); });
  elements.updatedLabel.textContent = t("updated", { date: formatVerifiedDate(RESEARCH_NOTE.verifiedAt) });
  elements.languageSelect.value = state.locale;
  elements.sortLabel.textContent = t({ distance: "sortDistance", soon: "sortSoon", verified: "sortVerified" }[state.sort]);
}

function formatDistance(miles) {
  if (miles < .3) return t("within");
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
  return String(listing.kicker || listing.dateLabel).split("·")[0].trim();
}

function listingMatches(record, now) {
  const { listing, searchText, minimumPrice } = record;
  if (state.savedOnly && !state.saved.has(listing.id)) return false;
  if (state.scope === "city" && listing.city !== state.location.name) return false;
  if (![...state.intents].every((intent) => matchesIntent(listing, intent, { now, searchText, minimumPrice }))) return false;

  if (state.search) {
    if (!searchText.includes(state.search.toLocaleLowerCase(state.locale))) return false;
  }
  return true;
}

function sortedListings() {
  const now = new Date();
  const results = discoveryIndex().records
    .filter((record) => listingMatches(record, now))
    .map(({ listing }) => ({ ...listing, distance: distanceMiles(state.location, listing) }));

  if (state.sort === "soon" || (state.scope === "all" && state.sort === "distance")) {
    results.sort((a, b) => {
      const aRank = a.kind === "event" ? 0 : 1;
      const bRank = b.kind === "event" ? 0 : 1;
      const fallback = state.scope === "all" ? a.city.localeCompare(b.city) : a.distance - b.distance;
      return aRank - bRank || new Date(a.start) - new Date(b.start) || fallback;
    });
  } else if (state.sort === "verified") {
    results.sort((a, b) => b.sources.length - a.sources.length
      || (state.scope === "all" ? new Date(a.start) - new Date(b.start) : a.distance - b.distance));
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
    if (hours >= 1 && hours < 24) return t("verifiedHoursAgo", { count: hours });
  }
  const checkedKey = hasTime ? dateKeyInTimeZone(checked) : String(value).slice(0, 10);
  const todayKey = dateKeyInTimeZone(today);
  const days = Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${checkedKey}T00:00:00Z`)) / 86400000);
  if (days <= 0) return t("verifiedToday");
  if (days === 1) return t("verifiedYesterday");
  return t("verifiedOn", { date: formatVerifiedDate(value) });
}

function homeSections(listings) {
  const filteredMode = state.scope === "city" || state.savedOnly || Boolean(state.search) || state.intents.size > 0;
  if (filteredMode) return [{ key: "results", items: listings }];

  const pool = [...listings];
  const currentWeekend = weekendWindow(new Date());
  const minimumPriceFor = (listing) => discoveryIndex().recordById.get(listing.id)?.minimumPrice ?? Number.POSITIVE_INFINITY;
  const take = (predicate, limit) => {
    const selected = [];
    for (let index = 0; index < pool.length && selected.length < limit;) {
      if (predicate(pool[index])) selected.push(...pool.splice(index, 1));
      else index += 1;
    }
    return selected;
  };

  const good = take(() => true, 4);
  const worth = take(listing => listing.kind === "event", 4);
  const weekend = take((listing) => listing.costType === "free" && overlapsWindow(listing, currentWeekend), 4);
  const budget = take((listing) => listing.costType === "discount" && minimumPriceFor(listing) <= 10, 4);
  return [
    { key: "good", items: good },
    { key: "worth", items: worth },
    { key: "weekend", items: weekend },
    { key: "budget", items: budget },
    { key: "more", items: pool }
  ].filter(section => section.items.length > 0);
}

function renderFeed() {
  const listings = sortedListings();
  let startIndex = 0;
  elements.feed.innerHTML = homeSections(listings).map(section => {
    const markup = templates.sectionTemplate(section, startIndex);
    startIndex += section.items.length;
    return markup;
  }).join("");
  elements.resultCount.textContent = listings.length;
  elements.emptyState.hidden = listings.length > 0;
  elements.feed.hidden = listings.length === 0;
  updateActiveNotice();
  updateIntentUI();
  updateSavedCount();
  renderNearbyCities();
}

function updateActiveNotice() {
  const notices = [];
  if (state.scope === "city") notices.push(t("cityOnly", { city: state.location.label || state.location.name }));
  if (state.scope === "nearby") notices.push(t("sortedNear", { city: state.location.label || state.location.name }));
  if (state.savedOnly) notices.push(t("savedOnly"));
  if (state.search) notices.push(t("searchResults", { query: state.search }));
  state.intents.forEach(intent => {
    const chip = $(`.intent-chip[data-intent="${intent}"]`);
    if (chip) notices.push(chip.textContent.trim());
  });
  elements.activeNotice.hidden = notices.length === 0;
  elements.activeNoticeText.textContent = notices.join(" · ");
}

function updateIntentUI() {
  $$(".intent-chip").forEach(chip => {
    const group = chip.dataset.clearGroup;
    const active = chip.dataset.intent
      ? state.intents.has(chip.dataset.intent)
      : group ? !$$(`[data-intent-group="${group}"]`).some(item => state.intents.has(item.dataset.intent)) : false;
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-pressed", String(active));
  });
}

function updateSavedCount() {
  const count = state.saved.size;
  elements.savedCount.textContent = count;
  elements.savedCount.hidden = count === 0;
}

function updateLocationUI() {
  if (state.scope === "all") {
    elements.locationModeLabel.textContent = t("browseArea");
    elements.locationName.textContent = t("allDfw");
    elements.homeLocationName.textContent = t("allDfw");
  } else {
    const isPreset = CITY_PRESETS.some(city => city.lat === state.location.lat && city.lng === state.location.lng);
    const label = isPreset
      ? (state.location.label || state.location.name)
      : t("currentNear", { city: state.location.name });
    elements.locationModeLabel.textContent = state.scope === "city" ? t("cityFilter") : t("nearby");
    elements.locationName.textContent = label;
    elements.homeLocationName.textContent = label;
  }
  elements.allDfwOption.classList.toggle("active", state.scope === "all");
  elements.allDfwOption.setAttribute("aria-pressed", String(state.scope === "all"));
  $$(".city-button", elements.cityGrid).forEach(button => {
    const active = state.scope === "city" && button.dataset.city === state.location.name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderCityGrid() {
  elements.cityGrid.innerHTML = CITY_PRESETS.map(city => {
    const count = discoveryIndex().cityCounts.get(city.name) || 0;
    const active = state.scope === "city" && city.name === state.location.name;
    return `
      <button class="city-button ${active ? "active" : ""}" data-city="${escapeHtml(city.name)}" type="button" aria-pressed="${active}" aria-label="${escapeHtml(t("cityButtonLabel", { city: city.name, count }))}" ${count === 0 ? "disabled" : ""}>
        <strong>${escapeHtml(city.name)}</strong><small>${escapeHtml(t("benefitsCount", { count }))}</small>
      </button>`;
  }).join("");
}

function renderNearbyCities() {
  const nearby = CITY_PRESETS
    .filter(city => state.scope === "all" || city.name !== state.location.name)
    .map(city => ({ ...city, distance: distanceMiles(state.location, city), count: discoveryIndex().cityCounts.get(city.name) || 0 }))
    .filter(city => city.count > 0)
    .sort((a, b) => state.scope === "all" ? b.count - a.count || a.name.localeCompare(b.name) : a.distance - b.distance)
    .slice(0, 5);

  elements.nearbyCitiesTitle.textContent = t(state.scope === "all" ? "browseCities" : "nearbyCities");
  elements.nearbyCities.innerHTML = nearby.map(city => `
    <button class="nearby-city" data-city="${escapeHtml(city.name)}" type="button">
      <span><strong>${escapeHtml(city.name)}</strong><small>${state.scope === "all" ? "" : `${escapeHtml(formatDistance(city.distance))} · `}${escapeHtml(t("benefitsCount", { count: city.count }))}</small></span>
      <span>${escapeHtml(t("view"))}</span>
    </button>
  `).join("");
}

function persistArea() {
  storage.write("nearfree-scope", state.scope);
  if (state.scope !== "all") storage.writeJson("nearfree-location", state.location.name);
}

function selectAllDfw() {
  state.scope = "all";
  if (state.sort === "distance") state.sort = "soon";
  persistArea();
  applyStaticTranslations();
  updateLocationUI();
  renderFeed();
  closeDialogs();
  showToast(t("allDfwSelected"));
}

function selectCity(name) {
  const city = CITY_PRESETS.find(item => item.name === name);
  if (!city) return;
  state.location = city;
  state.scope = "city";
  persistArea();
  updateLocationUI();
  renderFeed();
  closeDialogs();
  showToast(t("citySelected", { city: city.label || city.name }));
}

function nearestCity(location) {
  return CITY_PRESETS
    .map(city => ({ ...city, distance: distanceMiles(location, city) }))
    .sort((a, b) => a.distance - b.distance)[0];
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
  navigator.geolocation.getCurrentPosition(position => {
    const exact = { lat: position.coords.latitude, lng: position.coords.longitude };
    const nearest = nearestCity(exact);
    state.location = { name: nearest.name, isCurrent: true, ...exact };
    state.scope = "nearby";
    state.sort = "distance";
    persistArea();
    applyStaticTranslations();
    updateLocationUI();
    renderFeed();
    button.disabled = false;
    elements.locationStatus.textContent = t("located");
    setTimeout(closeDialogs, 600);
    showToast(t("locationSorted"));
  }, error => {
    button.disabled = false;
    const message = error.code === 1 ? t("locationDenied") : t("locationFailed");
    elements.locationStatus.textContent = message;
  }, { enableHighAccuracy: false, timeout: 9000, maximumAge: 300000 });
}

function mapUrl(listing) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${listing.venue}, ${listing.address}`)}`;
}

function similarListings(listing) {
  return LISTINGS
    .filter(item => item.id !== listing.id)
    .map(item => {
      const translated = translatedListing(item);
      const nearbyDistance = distanceMiles(listing, item);
      const categoryRank = item.category === listing.category ? 0 : 1;
      const costRank = item.costType === listing.costType ? 0 : 1;
      return { ...translated, nearbyDistance, categoryRank, costRank };
    })
    .sort((a, b) => a.categoryRank - b.categoryRank || a.costRank - b.costRank || a.nearbyDistance - b.nearbyDistance)
    .slice(0, 3);
}

const templates = createListingTemplates({
  compactCost,
  displayCost,
  escapeHtml,
  formatDistance,
  getTimeStatus,
  isAllDfw: () => state.scope === "all",
  isSaved: (id) => state.saved.has(id),
  mapUrl,
  similarListings,
  t,
  verificationAge,
  distanceFromSelected: (listing) => distanceMiles(state.location, listing)
});

function updateDetailControls(listing = null) {
  const hasListing = Boolean(listing);
  elements.detailSave.hidden = !hasListing;
  elements.detailShare.hidden = !hasListing;
  if (!listing) return;
  const saved = state.saved.has(listing.id);
  elements.detailSave.dataset.id = listing.id;
  elements.detailShare.dataset.id = listing.id;
  elements.detailSave.classList.toggle("saved", saved);
  elements.detailSave.setAttribute("aria-label", saved ? t("unsave") : t("save"));
  elements.detailShare.setAttribute("aria-label", t("share"));
}

function openDetails(id) {
  const listing = sourceListing(id);
  if (!listing) return;
  updateDetailControls(listing);
  elements.detailContent.innerHTML = templates.detailTemplate(translatedListing(listing));
  openDialog(elements.detailDialog);
  const url = new URL(window.location.href);
  if (url.searchParams.get("listing") !== id) {
    url.searchParams.set("listing", id);
    history.pushState({ listing: id }, "", url);
  }
}

function openMethodology() {
  updateDetailControls();
  elements.detailContent.innerHTML = templates.methodologyTemplate(RESEARCH_NOTE);
  openDialog(elements.detailDialog);
}

function resetDetailScroll() {
  elements.detailScrollArea.scrollTop = 0;
  requestAnimationFrame(() => {
    elements.detailScrollArea.scrollTop = 0;
  });
}

function clearListingRoute() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("listing")) return;
  url.searchParams.delete("listing");
  history.replaceState({}, "", url);
}

function openDialog(dialog) {
  closeDialogs({ clearRoute: false });
  elements.modalBackdrop.hidden = false;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  if (dialog === elements.detailDialog) resetDetailScroll();
  document.body.classList.add("modal-open");
}

function closeDialogs({ clearRoute = true } = {}) {
  [elements.locationDialog, elements.detailDialog, elements.sortDialog].forEach(dialog => {
    if (dialog?.open) dialog.close();
    else dialog?.removeAttribute("open");
  });
  elements.modalBackdrop.hidden = true;
  document.body.classList.remove("modal-open");
  if (clearRoute) clearListingRoute();
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
}

async function shareListing(listing) {
  const url = new URL(window.location.href);
  url.searchParams.set("listing", listing.id);
  const shareData = {
    title: `${listing.title} | NearFree DFW`,
    text: `${displayCost(listing)} · ${listing.dateLabel}\n${listing.venue}, ${listing.city}\n${listing.actionUrl}`,
    url: url.href
  };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
      showToast(t("linkCopied"));
    }
  } catch (error) {
    if (error?.name !== "AbortError") showToast(t("shareFailed"));
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

function focusSearch() {
  $("#discoveryPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  requestAnimationFrame(() => elements.searchInput.focus());
}

function resetFilters() {
  state.scope = "all";
  if (state.sort === "distance") state.sort = "soon";
  state.intents.clear();
  state.search = "";
  state.savedOnly = false;
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
}

function bindEvents() {
  elements.languageSelect.addEventListener("change", event => setLocale(event.target.value));
  $("#locationButton").addEventListener("click", () => openDialog(elements.locationDialog));
  $("#homeLocationButton").addEventListener("click", () => openDialog(elements.locationDialog));
  $("#allCitiesButton").addEventListener("click", () => openDialog(elements.locationDialog));
  elements.allDfwOption.addEventListener("click", selectAllDfw);
  $("#detectLocation").addEventListener("click", useCurrentLocation);

  $("#mobileExplore").addEventListener("click", focusSearch);
  elements.searchInput.addEventListener("input", event => {
    state.search = event.target.value.trim();
    elements.searchClear.hidden = !state.search;
    renderFeed();
  });
  elements.searchClear.addEventListener("click", () => {
    state.search = "";
    elements.searchInput.value = "";
    elements.searchClear.hidden = true;
    renderFeed();
    elements.searchInput.focus();
  });

  $("#intentChips").addEventListener("click", event => {
    const chip = event.target.closest(".intent-chip");
    if (!chip) return;
    const intent = chip.dataset.intent;
    const group = chip.dataset.intentGroup || chip.dataset.clearGroup;
    $$(`[data-intent-group="${group}"]`).forEach(item => state.intents.delete(item.dataset.intent));
    if (intent && chip.getAttribute("aria-pressed") !== "true") state.intents.add(intent);
    renderFeed();
  });

  $("#sortButton").addEventListener("click", () => {
    $$("[data-sort]", elements.sortDialog).forEach(button => {
      button.disabled = button.dataset.sort === "distance" && state.scope === "all";
      button.classList.toggle("active", button.dataset.sort === state.sort);
    });
    openDialog(elements.sortDialog);
  });
  elements.sortDialog.addEventListener("click", event => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    state.sort = button.dataset.sort;
    elements.sortLabel.textContent = t({ distance: "sortDistance", soon: "sortSoon", verified: "sortVerified" }[state.sort]);
    closeDialogs();
    renderFeed();
  });

  elements.feed.addEventListener("click", event => {
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
  elements.detailContent.addEventListener("click", event => {
    const similar = event.target.closest("[data-similar-id]");
    if (similar) {
      openDetails(similar.dataset.similarId);
      elements.detailScrollArea.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
  elements.detailSave.addEventListener("click", () => {
    const listing = sourceListing(elements.detailSave.dataset.id);
    if (!listing) return;
    toggleSave(listing.id);
    updateDetailControls(listing);
  });
  elements.detailShare.addEventListener("click", () => {
    const listing = sourceListing(elements.detailShare.dataset.id);
    if (listing) shareListing(translatedListing(listing));
  });
  elements.cityGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-city]");
    if (button) selectCity(button.dataset.city);
  });
  elements.nearbyCities.addEventListener("click", event => {
    const button = event.target.closest("[data-city]");
    if (button) selectCity(button.dataset.city);
  });

  const toggleSavedOnly = () => {
    if (state.saved.size === 0) {
      state.savedOnly = false;
      showToast(t("noSaved"));
      return;
    }
    state.savedOnly = !state.savedOnly;
    renderFeed();
    $("#resultsToolbar").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(state.savedOnly ? t("savedShown") : t("allShown"));
  };
  $("#savedButton").addEventListener("click", toggleSavedOnly);
  $("#mobileSaved").addEventListener("click", toggleSavedOnly);

  $("#methodButton").addEventListener("click", openMethodology);
  $("#railMethodButton").addEventListener("click", openMethodology);
  $("#mobileInfo").addEventListener("click", openMethodology);
  $("#clearAllFilters").addEventListener("click", resetFilters);
  $("#emptyReset").addEventListener("click", resetFilters);
  elements.modalBackdrop.addEventListener("click", closeDialogs);
  $$('[data-close]').forEach(button => button.addEventListener("click", closeDialogs));
  [elements.locationDialog, elements.detailDialog, elements.sortDialog].forEach(dialog => {
    dialog.addEventListener("cancel", event => { event.preventDefault(); closeDialogs(); });
  });
  window.addEventListener("popstate", () => {
    const id = new URL(window.location.href).searchParams.get("listing");
    if (id && sourceListing(id)) {
      const listing = sourceListing(id);
      updateDetailControls(listing);
      elements.detailContent.innerHTML = templates.detailTemplate(translatedListing(listing));
      openDialog(elements.detailDialog);
    } else {
      closeDialogs({ clearRoute: false });
    }
  });
}

function init() {
  applyStaticTranslations();
  renderCityGrid();
  updateLocationUI();
  bindEvents();
  renderFeed();
  const initialListingId = new URL(window.location.href).searchParams.get("listing");
  if (initialListingId && sourceListing(initialListingId)) {
    const listing = sourceListing(initialListingId);
    updateDetailControls(listing);
    elements.detailContent.innerHTML = templates.detailTemplate(translatedListing(listing));
    openDialog(elements.detailDialog);
  } else if (initialListingId) {
    clearListingRoute();
  }
}

init();
