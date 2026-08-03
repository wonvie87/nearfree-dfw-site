import { CITY_PRESETS, LISTINGS, RESEARCH_NOTE } from "./data.js";
import { UI, localizeListing } from "./locales.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const storedLocationValue = safeParse(localStorage.getItem("nearfree-location"));
const storedSaved = safeParse(localStorage.getItem("nearfree-saved"));
const storedLocale = localStorage.getItem("nearfree-locale");
const storedLocationName = typeof storedLocationValue === "string"
  ? storedLocationValue
  : storedLocationValue?.name;
const storedLocation = CITY_PRESETS.find(city => city.name === storedLocationName) || CITY_PRESETS[0];

// Older versions stored precise coordinates. Normalize them to a city name on load.
if (storedLocationValue !== null) {
  localStorage.setItem("nearfree-location", JSON.stringify(storedLocation.name));
}

const state = {
  location: storedLocation || CITY_PRESETS[0],
  intents: new Set(),
  sort: "distance",
  search: "",
  saved: new Set(Array.isArray(storedSaved) ? storedSaved : []),
  savedOnly: false,
  locale: ["en", "ko"].includes(storedLocale) ? storedLocale : "en"
};

const elements = {
  feed: $("#feed"),
  resultCount: $("#resultCount"),
  emptyState: $("#emptyState"),
  locationName: $("#locationName"),
  homeLocationName: $("#homeLocationName"),
  locationDialog: $("#locationDialog"),
  locationStatus: $("#locationStatus"),
  cityGrid: $("#cityGrid"),
  nearbyCities: $("#nearbyCities"),
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

function safeParse(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

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

function formatVerifiedDate(value) {
  const locale = state.locale === "ko" ? "ko-KR" : "en-US";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
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

function radians(degrees) { return degrees * Math.PI / 180; }

function distanceMiles(a, b) {
  const earthRadius = 3958.8;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
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
  if (overlapsWindow(listing, dayWindow())) return t("today");
  if (overlapsWindow(listing, dayWindow(1))) return t("tomorrow");
  const startDay = new Date(start);
  const today = new Date(now);
  startDay.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((startDay - today) / 86400000);
  if (diff <= 7) return t("daysAway", { count: diff });
  if (diff <= 31) return t("weeksAway", { count: Math.ceil(diff / 7) });
  return listing.kicker.split("·")[0].trim();
}

function dayWindow(offset = 0) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function weekendWindow() {
  const today = dayWindow().start;
  const day = today.getDay();
  const daysUntilSaturday = day === 0 ? 6 : (6 - day + 7) % 7;
  const start = new Date(today);
  start.setDate(start.getDate() + daysUntilSaturday);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return { start, end };
}

function overlapsWindow(listing, window) {
  const start = new Date(listing.start);
  const end = listing.end ? new Date(listing.end) : new Date("2999-12-31T23:59:59Z");
  return start < window.end && end >= window.start;
}

function searchableText(listing) {
  const original = LISTINGS.find(item => item.id === listing.id) || listing;
  return [
    listing.title, listing.city, listing.venue, listing.summary, listing.cost, listing.finePrint,
    ...(listing.highlights || []), ...listing.tags,
    original.title, original.summary, original.cost, original.finePrint,
    ...(original.highlights || []), ...original.tags
  ].join(" ").toLocaleLowerCase();
}

function lowestPrice(listing) {
  if (listing.costType === "free") return 0;
  if (/free|무료/i.test(searchableText(listing))) return 0;
  const amounts = [...searchableText(listing).matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map(match => Number(match[1]));
  return amounts.length ? Math.min(...amounts) : Number.POSITIVE_INFINITY;
}

function matchesIntent(listing, intent) {
  const text = searchableText(listing);
  if (intent === "today") return overlapsWindow(listing, dayWindow());
  if (intent === "tomorrow") return overlapsWindow(listing, dayWindow(1));
  if (intent === "weekend") return overlapsWindow(listing, weekendWindow());
  if (intent === "tonight") {
    const window = dayWindow();
    window.start.setHours(17, 0, 0, 0);
    return overlapsWindow(listing, window);
  }
  if (intent === "free") return lowestPrice(listing) === 0;
  if (intent === "under5") return lowestPrice(listing) <= 5;
  if (intent === "under10") return lowestPrice(listing) <= 10;
  if (intent === "kids") return listing.category === "family" || /아이와|가족|전 연령|키즈|kids?|family|all ages/.test(text);
  if (intent === "date") return /라이브 음악|재즈|예술|갤러리|영화|성인|콘서트|축제|마켓|live music|jazz|art|gallery|film|adult|concert|festival|market/.test(text);
  if (intent === "outdoor") return listing.category === "outdoors" || /야외|공원|정원|트레일|outdoors?|park|garden|trail/.test(text);
  if (intent === "indoor") return /실내|박물관|갤러리|도서관|전시|indoors?|museum|gallery|library|exhibit/.test(text);
  if (intent === "food") return /음식|푸드|먹|푸드 트럭|food|eat|restaurant|happy hour/.test(text);
  if (intent === "museums") return /박물관|미술관|갤러리|전시|museum|gallery|exhibit/.test(text);
  if (intent === "festivals") return listing.category === "festival" || /축제|페스티벌|festival|fest/.test(text);
  return true;
}

function listingMatches(listing) {
  if (state.savedOnly && !state.saved.has(listing.id)) return false;
  if (![...state.intents].every(intent => matchesIntent(listing, intent))) return false;

  if (state.search) {
    const haystack = searchableText(listing);
    if (!haystack.includes(state.search.toLocaleLowerCase(state.locale))) return false;
  }
  return true;
}

function sortedListings() {
  const results = LISTINGS.map(translatedListing).filter(listingMatches).map(listing => ({
    ...listing,
    distance: distanceMiles(state.location, listing)
  }));

  if (state.sort === "soon") {
    results.sort((a, b) => {
      const aRank = a.kind === "event" ? 0 : 1;
      const bRank = b.kind === "event" ? 0 : 1;
      return aRank - bRank || new Date(a.start) - new Date(b.start) || a.distance - b.distance;
    });
  } else if (state.sort === "verified") {
    results.sort((a, b) => b.sources.length - a.sources.length || a.distance - b.distance);
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
  const checked = new Date(hasTime ? value : `${value}T12:00:00`);
  const today = new Date();
  if (hasTime) {
    const hours = Math.floor((today - checked) / 3_600_000);
    if (hours >= 0 && hours < 1) return t("verifiedRecently");
    if (hours >= 1 && hours < 24) return t("verifiedHoursAgo", { count: hours });
  }
  checked.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today - checked) / 86400000);
  if (days <= 0) return t("verifiedToday");
  if (days === 1) return t("verifiedYesterday");
  return t("verifiedOn", { date: formatVerifiedDate(value) });
}

function cardTitleContent(listing) {
  const base = listing.titleBase || listing.title;
  const benefit = listing.titleBenefit
    ? `<span class="listing-title-benefit">${escapeHtml(listing.titleBenefit)}</span>`
    : "";
  return `<span class="listing-title-base">${escapeHtml(base)}</span>${benefit}`;
}

function cardTemplate(listing, index) {
  const saved = state.saved.has(listing.id);
  return `
    <article class="listing-card" data-id="${listing.id}">
      <div class="listing-media">
        <button class="listing-media-open" data-action="details" type="button" aria-label="${escapeHtml(t("detailsAria", { title: listing.title }))}">
          <img src="${escapeHtml(listing.image)}" alt="${escapeHtml(listing.imageAlt)}" loading="${index < 4 ? "eager" : "lazy"}" />
          <span class="listing-media-shade"></span>
        </button>
        <span class="listing-price ${listing.costType === "discount" ? "discount" : ""}">${escapeHtml(compactCost(listing))}</span>
        <button class="listing-save ${saved ? "saved" : ""}" data-action="save" type="button" aria-label="${escapeHtml(saved ? t("unsave") : t("save"))}">
          <svg viewBox="0 0 24 24"><path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
        </button>
      </div>
      <div class="listing-body">
        <div class="listing-schedule">
          <span class="listing-time-status">${escapeHtml(getTimeStatus(listing))}</span>
          <span class="listing-date">${escapeHtml(listing.dateLabel)}</span>
        </div>
        <button class="listing-title" data-action="details" type="button" aria-label="${escapeHtml(listing.title)}">${cardTitleContent(listing)}</button>
        <div class="listing-place">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>
          <span class="listing-place-copy"><strong>${escapeHtml(listing.venue)}</strong><span>${escapeHtml(listing.city)} · ${escapeHtml(formatDistance(listing.distance))}</span></span>
        </div>
        <button class="listing-verification" data-action="details" type="button">
          <span class="verified-check" aria-hidden="true">✓</span>
          <span>${escapeHtml(verificationAge(listing.verifiedAt))} · ${escapeHtml(t("sourcesShort", { count: listing.sources.length }))}</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>`;
}

function homeSections(listings) {
  const filteredMode = state.savedOnly || Boolean(state.search) || state.intents.size > 0;
  if (filteredMode) return [{ key: "results", items: listings }];

  const pool = [...listings];
  const take = (predicate, limit) => {
    const selected = [];
    for (let index = 0; index < pool.length && selected.length < limit;) {
      if (predicate(pool[index])) selected.push(...pool.splice(index, 1));
      else index += 1;
    }
    return selected;
  };

  const weekend = take(listing => listing.costType === "free" && overlapsWindow(listing, weekendWindow()), 4);
  const budget = take(listing => listing.costType === "discount" && lowestPrice(listing) <= 10, 4);
  const good = take(() => true, 4);
  const worth = take(listing => listing.kind === "event", 4);
  return [
    { key: "good", items: good },
    { key: "worth", items: worth },
    { key: "weekend", items: weekend },
    { key: "budget", items: budget },
    { key: "more", items: pool }
  ].filter(section => section.items.length > 0);
}

function sectionTemplate(section, startIndex) {
  const icon = { good: "✦", worth: "🔥", weekend: "☀", budget: "$", more: "+", results: "✦" }[section.key];
  return `
    <section class="listing-section" aria-labelledby="section-${section.key}">
      <div class="listing-section-head">
        <div><span class="section-symbol" aria-hidden="true">${icon}</span><h2 id="section-${section.key}">${escapeHtml(t(`section${section.key[0].toUpperCase()}${section.key.slice(1)}`))}</h2></div>
        <p>${escapeHtml(t(`section${section.key[0].toUpperCase()}${section.key.slice(1)}Desc`))}</p>
      </div>
      <div class="listing-grid">${section.items.map((listing, index) => cardTemplate(listing, startIndex + index)).join("")}</div>
    </section>`;
}

function renderFeed() {
  const listings = sortedListings();
  let startIndex = 0;
  elements.feed.innerHTML = homeSections(listings).map(section => {
    const markup = sectionTemplate(section, startIndex);
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
    const active = state.intents.has(chip.dataset.intent);
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
  const isPreset = CITY_PRESETS.some(city => city.lat === state.location.lat && city.lng === state.location.lng);
  const label = isPreset
    ? (state.location.label || state.location.name)
    : t("currentNear", { city: state.location.name });
  elements.locationName.textContent = label;
  elements.homeLocationName.textContent = label;
  $$(".city-button", elements.cityGrid).forEach(button => {
    button.classList.toggle("active", button.dataset.city === state.location.name);
  });
}

function renderCityGrid() {
  elements.cityGrid.innerHTML = CITY_PRESETS.map(city => `
    <button class="city-button ${city.name === state.location.name ? "active" : ""}" data-city="${escapeHtml(city.name)}" type="button">${escapeHtml(city.name)}</button>
  `).join("");
}

function renderNearbyCities() {
  const nearby = CITY_PRESETS
    .filter(city => city.name !== state.location.name)
    .map(city => ({ ...city, distance: distanceMiles(state.location, city), count: LISTINGS.filter(item => item.city === city.name).length }))
    .filter(city => city.count > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  elements.nearbyCities.innerHTML = nearby.map(city => `
    <button class="nearby-city" data-city="${escapeHtml(city.name)}" type="button">
      <span><strong>${escapeHtml(city.name)}</strong><small>${formatDistance(city.distance)} · ${escapeHtml(t("benefitsCount", { count: city.count }))}</small></span>
      <span>${escapeHtml(t("view"))}</span>
    </button>
  `).join("");
}

function persistLocation() {
  localStorage.setItem("nearfree-location", JSON.stringify(state.location.name));
}

function selectCity(name) {
  const city = CITY_PRESETS.find(item => item.name === name);
  if (!city) return;
  state.location = city;
  persistLocation();
  updateLocationUI();
  renderFeed();
  closeDialogs();
  showToast(t("citySelected", { city: city.label }));
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

function similarTemplate(listing) {
  return `
    <button class="similar-card" data-similar-id="${listing.id}" type="button">
      <img src="${escapeHtml(listing.image)}" alt="" loading="lazy" />
      <span class="similar-copy">
        <small>${escapeHtml(compactCost(listing))} · ${escapeHtml(getTimeStatus(listing))}</small>
        <strong>${escapeHtml(listing.title)}</strong>
        <span>${escapeHtml(listing.city)} · ${escapeHtml(formatDistance(listing.nearbyDistance))}</span>
      </span>
      <span aria-hidden="true">→</span>
    </button>`;
}

function detailTemplate(listing) {
  const distance = formatDistance(distanceMiles(state.location, listing));
  const similar = similarListings(listing);
  const highlights = listing.highlights || [];
  const practicalTips = listing.practicalTips || [];
  return `
    <section class="detail-photo">
      <img src="${escapeHtml(listing.image)}" alt="${escapeHtml(listing.imageAlt)}" />
    </section>
    <div class="detail-decision">
      <span class="detail-price ${listing.costType === "discount" ? "discount" : ""}">${escapeHtml(displayCost(listing))}</span>
      <h2 id="detailTitle">${escapeHtml(listing.title)}</h2>
      <p class="detail-overview">${escapeHtml(listing.summary)}</p>
      <div class="detail-primary-facts">
        <p><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg><strong>${escapeHtml(listing.dateLabel)}</strong></p>
        <p><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg><strong>${escapeHtml(listing.venue)}</strong><span>${escapeHtml(listing.city)}</span></p>
        <p><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M5 17l2-7h10l2 7M8 17v2M16 17v2"/></svg><strong>${escapeHtml(t("approxDistance", { distance }))}</strong></p>
      </div>
      <div class="detail-action-row">
        <a href="${mapUrl(listing)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("directions"))}</a>
        <a class="official-action" href="${escapeHtml(listing.actionUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("officialSite"))} ↗</a>
      </div>
    </div>
    <section class="detail-section highlights-section">
      <h3>${escapeHtml(t("highlights"))}</h3>
      <div class="detail-highlight-list">
        ${highlights.map((highlight, index) => `
          <article class="detail-highlight">
            <span class="detail-highlight-mark">${String(index + 1).padStart(2, "0")}</span>
            <p>${escapeHtml(highlight)}</p>
          </article>`).join("")}
      </div>
    </section>
    <section class="detail-section visit-section">
      <h3>${escapeHtml(t("planVisit"))}</h3>
      <div class="visit-fact-grid">
        <article class="visit-fact">
          <span class="visit-fact-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V7Z"/><path d="M12 7v12"/></svg></span>
          <div><span>${escapeHtml(t("dealCost"))}</span><strong>${escapeHtml(listing.cost)}</strong></div>
        </article>
        <article class="visit-fact">
          <span class="visit-fact-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5 11 15l4.8-6"/></svg></span>
          <div><span>${escapeHtml(t("entryDetails"))}</span><strong>${escapeHtml(listing.reservation)}</strong></div>
        </article>
      </div>
      ${practicalTips.length ? `
        <section class="practical-tips" aria-labelledby="practicalTipsTitle">
          <h4 id="practicalTipsTitle">${escapeHtml(t("practicalTips"))}</h4>
          <ul class="practical-tip-list">
            ${practicalTips.map(tip => `<li><span aria-hidden="true">✓</span><p>${escapeHtml(tip)}</p></li>`).join("")}
          </ul>
        </section>` : ""}
      <aside class="before-callout">
        <span class="before-callout-mark" aria-hidden="true">!</span>
        <div><h4>${escapeHtml(t("beforeGo"))}</h4><p>${escapeHtml(listing.finePrint)}</p></div>
      </aside>
    </section>
    <section class="detail-section verification-section">
      <div class="verification-title">
        <span class="verified-seal">✓</span>
        <div><h3>${escapeHtml(t("nearFreeVerified"))}</h3><p>${escapeHtml(verificationAge(listing.verifiedAt))}</p></div>
      </div>
      <div class="verification-grid" aria-label="${escapeHtml(t("verificationChecklist"))}">
        <span>${escapeHtml(t("verifiedPrice"))}<b>✓</b></span>
        <span>${escapeHtml(t("verifiedDate"))}<b>✓</b></span>
        <span>${escapeHtml(t("verifiedLocation"))}<b>✓</b></span>
        <span>${escapeHtml(t("verifiedConditions"))}<b>✓</b></span>
      </div>
      <details class="detail-sources">
        <summary>${escapeHtml(t("sourcesChecked", { count: listing.sources.length }))}<span>›</span></summary>
        <div class="detail-source-list">
          ${listing.sources.map((source, index) => `
            <a class="source-item" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
              <span class="source-index">0${index + 1}</span>
              <span class="source-copy"><strong>${escapeHtml(source.name)} · ${escapeHtml(source.official ? t("official") : t("supporting"))}</strong><small>${escapeHtml(source.note)}</small></span>
              <span>↗</span>
            </a>`).join("")}
        </div>
      </details>
    </section>
    ${similar.length ? `
      <section class="detail-section similar-section">
        <h3>${escapeHtml(t("similarNearby"))}</h3>
        <div class="similar-list">${similar.map(similarTemplate).join("")}</div>
      </section>` : ""}`;
}

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
  const listing = LISTINGS.find(item => item.id === id);
  if (!listing) return;
  updateDetailControls(listing);
  elements.detailContent.innerHTML = detailTemplate(translatedListing(listing));
  openDialog(elements.detailDialog);
}

function openMethodology() {
  updateDetailControls();
  elements.detailContent.innerHTML = `
    <section class="detail-hero methodology-hero">
      <div class="detail-hero-copy">
        <span class="price-badge">${escapeHtml(t("methodologyBadge"))}</span>
        <h2 id="detailTitle">${escapeHtml(t("methodologyTitle"))}</h2>
      </div>
    </section>
    <div class="detail-body">
      <div class="detail-facts">
        <div class="detail-fact"><small>${escapeHtml(t("dataDate"))}</small><strong>${RESEARCH_NOTE.verifiedAt}</strong></div>
        <div class="detail-fact"><small>${escapeHtml(t("minimumSources"))}</small><strong>${escapeHtml(t("twoPerListing"))}</strong></div>
        <div class="detail-fact"><small>${escapeHtml(t("preferredSources"))}</small><strong>${escapeHtml(t("officialPages"))}</strong></div>
        <div class="detail-fact"><small>${escapeHtml(t("checkedFields"))}</small><strong>${escapeHtml(t("fieldsValue"))}</strong></div>
      </div>
      <p class="detail-summary">${escapeHtml(t("methodology"))}</p>
      <div class="condition-box"><strong>${escapeHtml(t("liveChangesTitle"))}</strong><p>${escapeHtml(t("disclaimer"))}</p></div>
      <section class="sources-panel">
        <div class="source-head"><h3>${escapeHtml(t("cardShows"))}</h3><span>${escapeHtml(t("transparencyLabel"))}</span></div>
        <div class="source-item"><span class="source-index">01</span><span class="source-copy"><strong>${escapeHtml(t("accurateTerms"))}</strong><small>${escapeHtml(t("accurateTermsDesc"))}</small></span></div>
        <div class="source-item"><span class="source-index">02</span><span class="source-copy"><strong>${escapeHtml(t("directLinks"))}</strong><small>${escapeHtml(t("directLinksDesc"))}</small></span></div>
        <div class="source-item"><span class="source-index">03</span><span class="source-copy"><strong>${escapeHtml(t("visualsSeparated"))}</strong><small>${escapeHtml(t("visualsSeparatedDesc"))}</small></span></div>
      </section>
    </div>`;
  openDialog(elements.detailDialog);
}

function resetDetailScroll() {
  elements.detailScrollArea.scrollTop = 0;
  requestAnimationFrame(() => {
    elements.detailScrollArea.scrollTop = 0;
  });
}

function openDialog(dialog) {
  closeDialogs();
  elements.modalBackdrop.hidden = false;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  if (dialog === elements.detailDialog) resetDetailScroll();
  document.body.classList.add("modal-open");
}

function closeDialogs() {
  [elements.locationDialog, elements.detailDialog, elements.sortDialog].forEach(dialog => {
    if (dialog?.open) dialog.close();
    else dialog?.removeAttribute("open");
  });
  elements.modalBackdrop.hidden = true;
  document.body.classList.remove("modal-open");
}

function toggleSave(id) {
  if (state.saved.has(id)) {
    state.saved.delete(id);
    showToast(t("saveRemoved"));
  } else {
    state.saved.add(id);
    showToast(t("saveAdded"));
  }
  localStorage.setItem("nearfree-saved", JSON.stringify([...state.saved]));
  renderFeed();
}

async function shareListing(listing) {
  const shareData = {
    title: `${listing.title} | NearFree DFW`,
    text: `${displayCost(listing)} · ${listing.dateLabel}\n${listing.venue}, ${listing.city}\n${listing.actionUrl}`,
    url: listing.actionUrl
  };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}`);
      showToast(t("linkCopied"));
    }
  } catch (error) {
    if (error?.name !== "AbortError") showToast(t("shareFailed"));
  }
}

function icsDate(dateString) {
  return new Date(dateString).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function downloadCalendar(listing) {
  if (!listing.end) return;
  const content = [
    "BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//NearFree DFW//${state.locale.toUpperCase()}`, "BEGIN:VEVENT",
    `UID:${listing.id}@nearfree.local`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(listing.start)}`, `DTEND:${icsDate(listing.end)}`,
    `SUMMARY:${listing.title.replaceAll(",", "\\,")}`,
    `LOCATION:${`${listing.venue}, ${listing.address}`.replaceAll(",", "\\,")}`,
    `DESCRIPTION:${`${listing.summary} | ${t("calendarDescription")}: ${listing.actionUrl}`.replaceAll(",", "\\,").replaceAll("\n", "\\n")}`,
    `URL:${listing.actionUrl}`, "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${listing.id}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast(t("calendarMade"));
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
  state.intents.clear();
  state.search = "";
  state.savedOnly = false;
  elements.searchInput.value = "";
  elements.searchClear.hidden = true;
  renderFeed();
}

function setLocale(locale) {
  if (!["en", "ko"].includes(locale)) return;
  state.locale = locale;
  localStorage.setItem("nearfree-locale", locale);
  applyStaticTranslations();
  updateLocationUI();
  renderFeed();
}

function bindEvents() {
  elements.languageSelect.addEventListener("change", event => setLocale(event.target.value));
  $("#locationButton").addEventListener("click", () => openDialog(elements.locationDialog));
  $("#homeLocationButton").addEventListener("click", () => openDialog(elements.locationDialog));
  $("#allCitiesButton").addEventListener("click", () => openDialog(elements.locationDialog));
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
    if (state.intents.has(intent)) state.intents.delete(intent);
    else state.intents.add(intent);
    renderFeed();
  });

  $("#sortButton").addEventListener("click", () => {
    $$("[data-sort]", elements.sortDialog).forEach(button => button.classList.toggle("active", button.dataset.sort === state.sort));
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
    const sourceListing = LISTINGS.find(item => item.id === card?.dataset.id);
    if (!sourceListing) return;
    const listing = translatedListing(sourceListing);
    const action = target.dataset.action;
    if (action === "details") openDetails(listing.id);
    if (action === "save") toggleSave(listing.id);
    if (action === "share") shareListing(listing);
    if (action === "calendar") downloadCalendar(listing);
  });
  elements.detailContent.addEventListener("click", event => {
    const similar = event.target.closest("[data-similar-id]");
    if (similar) {
      const sourceListing = LISTINGS.find(item => item.id === similar.dataset.similarId);
      if (!sourceListing) return;
      updateDetailControls(sourceListing);
      elements.detailContent.innerHTML = detailTemplate(translatedListing(sourceListing));
      elements.detailScrollArea.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
  elements.detailSave.addEventListener("click", () => {
    const sourceListing = LISTINGS.find(item => item.id === elements.detailSave.dataset.id);
    if (!sourceListing) return;
    toggleSave(sourceListing.id);
    updateDetailControls(sourceListing);
  });
  elements.detailShare.addEventListener("click", () => {
    const sourceListing = LISTINGS.find(item => item.id === elements.detailShare.dataset.id);
    if (sourceListing) shareListing(translatedListing(sourceListing));
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
}

function init() {
  applyStaticTranslations();
  renderCityGrid();
  updateLocationUI();
  bindEvents();
  renderFeed();
}

init();
