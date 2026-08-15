export function createListingTemplates(context) {
  const {
    compactCost,
    displayCost,
    escapeHtml,
    formatDistance,
    getTimeStatus,
    isAllDfw,
    isSaved,
    mapUrl,
    similarListings,
    t,
    verificationAge,
  } = context;

  function detailTitleContent(listing) {
    const base = listing.titleBase || listing.title;
    const benefit = listing.titleBenefit
      ? `<span class="detail-title-benefit">${escapeHtml(listing.titleBenefit)}</span>`
      : "";
    return `<span class="detail-title-base">${escapeHtml(base)}</span>${benefit}`;
  }

  function imageOrPlaceholder(
    listing,
    className,
    loading = "lazy",
    alt = listing.imageAlt || "",
  ) {
    return listing.image
      ? `<img src="${escapeHtml(listing.image)}" alt="${escapeHtml(alt)}" loading="${loading}" />`
      : `<span class="${className}" aria-hidden="true"><span>NearFree</span></span>`;
  }

  function conditionalBadge(listing) {
    return listing.eligibility?.mode === "conditional"
      ? `<span class="listing-condition-badge">${escapeHtml(t("conditionalEligibility"))}</span>`
      : "";
  }

  const categoryToneClasses = Object.freeze({
    access: "tone-access",
    arts: "tone-arts",
    concert: "tone-concert",
    culture: "tone-culture",
    family: "tone-family",
    festival: "tone-festival",
    fitness: "tone-fitness",
    food: "tone-food",
    library: "tone-library",
    "local-deals": "tone-local-deals",
    recreation: "tone-recreation",
    transit: "tone-transit",
  });
  const categoryKeys = new Set(Object.keys(categoryToneClasses));
  function categoryKey(listing) {
    return categoryKeys.has(listing.category) ? listing.category : "community";
  }

  function categoryLabel(listing) {
    const key = categoryKey(listing).replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase(),
    );
    return t(`category${key[0].toUpperCase()}${key.slice(1)}`);
  }

  function categoryToneClass(listing) {
    return categoryToneClasses[categoryKey(listing)] || "tone-community";
  }

  function kindLabel(listing) {
    return t(listing.kind === "event" ? "eventLabel" : "benefitLabel");
  }

  function calendarDateParts(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? { year: match[1], month: match[2], day: match[3] } : null;
  }

  function compactCardDate(listing) {
    const start = calendarDateParts(listing.start);
    const end = calendarDateParts(listing.end);
    if (listing.kind === "benefit" && !end) return t("ongoingShort");
    if (!start) return getTimeStatus(listing);
    if (listing.kind === "benefit" && end) return `~${end.month}.${end.day}`;
    if (
      !end ||
      `${start.year}-${start.month}-${start.day}` ===
        `${end.year}-${end.month}-${end.day}`
    ) {
      return `${start.month}.${start.day}`;
    }
    if (start.year === end.year && start.month === end.month) {
      return `${start.month}.${start.day}–${end.day}`;
    }
    return `${start.month}.${start.day}–${end.month}.${end.day}`;
  }

  function cardTemplate(listing, index) {
    const saved = isSaved(listing.id);
    const tone = categoryToneClass(listing);
    const cardDate = compactCardDate(listing);
    const dateTime = String(
      listing.kind === "benefit" ? listing.end || "" : listing.start || "",
    ).slice(0, 10);
    const costLabel = t(
      listing.costType === "free" ? "valueFreeLabel" : "dealLabel",
    );
    return `
      <article class="listing-card listing-${listing.kind} ${tone}" data-id="${listing.id}">
        <div class="listing-media">
          <button class="listing-media-open" data-action="details" type="button" aria-label="${escapeHtml(t("detailsAria", { title: listing.title }))}">
            ${imageOrPlaceholder(listing, "listing-media-placeholder", index < 4 ? "eager" : "lazy")}
          </button>
          <button class="listing-save ${saved ? "saved" : ""}" data-action="save" type="button" aria-label="${escapeHtml(saved ? t("unsave") : t("save"))}">
            <svg viewBox="0 0 24 24"><path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
          </button>
        </div>
        <div class="listing-body">
          <div class="listing-card-meta">
            ${dateTime ? `<time class="listing-card-date" datetime="${escapeHtml(dateTime)}">${escapeHtml(cardDate)}</time>` : `<span class="listing-card-date">${escapeHtml(cardDate)}</span>`}
            <div class="listing-card-tags">
              <span>${escapeHtml(categoryLabel(listing))}</span>
              <span class="listing-cost-tag ${listing.costType === "discount" ? "discount" : ""}">${escapeHtml(costLabel)}</span>
            </div>
          </div>
          <button class="listing-title" data-action="details" type="button" aria-label="${escapeHtml(listing.title)}">
            <span>${escapeHtml(listing.title)}</span>
            <span class="listing-open-arrow" aria-hidden="true">↗</span>
          </button>
          <p class="listing-card-hook">${escapeHtml(listing.cardHook || listing.summary)}</p>
        </div>
      </article>`;
  }

  function sectionTemplate(section, startIndex) {
    const icon = {
      good: "✦",
      worth: "🔥",
      weekend: "☀",
      budget: "$",
      more: "+",
      results: "✦",
    }[section.key];
    const sectionName = section.key[0].toUpperCase() + section.key.slice(1);
    const titleKey =
      section.key === "good" && isAllDfw()
        ? "sectionGoodAll"
        : `section${sectionName}`;
    const descKey =
      section.key === "good" && isAllDfw()
        ? "sectionGoodAllDesc"
        : `section${sectionName}Desc`;
    return `
      <section class="listing-section" aria-labelledby="section-${section.key}">
        <div class="listing-section-head">
          <div><span class="section-symbol" aria-hidden="true">${icon}</span><h2 id="section-${section.key}">${escapeHtml(t(titleKey))}</h2></div>
          <p>${escapeHtml(t(descKey))}</p>
        </div>
        <div class="listing-grid" data-section="${escapeHtml(section.key)}">${section.items.map((listing, index) => cardTemplate(listing, startIndex + index)).join("")}</div>
      </section>`;
  }

  function similarTemplate(listing) {
    return `
      <button class="similar-card" data-similar-id="${listing.id}" type="button">
        ${imageOrPlaceholder(listing, "similar-media-placeholder", "lazy", "")}
        <span class="similar-copy">
          <small>${escapeHtml(compactCost(listing))} · ${escapeHtml(getTimeStatus(listing))}</small>
          <strong>${escapeHtml(listing.title)}</strong>
          <span>${escapeHtml(listing.city)} · ${escapeHtml(formatDistance(listing.nearbyDistance))}</span>
        </span>
        <span aria-hidden="true">→</span>
      </button>`;
  }

  function detailTemplate(listing) {
    const distance = formatDistance(context.distanceFromSelected(listing));
    const similar = similarListings(listing);
    const highlights = listing.highlights || [];
    const description = listing.description || [];
    const practicalTips = listing.practicalTips || [];
    const bookingDetail = listing.booking?.detail || listing.reservation;
    const eligibilityDetail = listing.eligibility?.detail || "";
    const tone = categoryToneClass(listing);
    return `
      <article class="listing-detail ${tone}">
        <div class="detail-hero-grid${listing.image ? "" : " detail-hero-without-photo"}">
          ${listing.image ? `<figure class="detail-photo">${imageOrPlaceholder(listing, "detail-media-placeholder", "eager")}<figcaption>${escapeHtml(t("editorialVisual"))}</figcaption></figure>` : ""}
          <section class="detail-decision">
            <div class="detail-eyebrow"><span>${escapeHtml(categoryLabel(listing))}</span><span>${escapeHtml(kindLabel(listing))}</span></div>
            <div class="detail-price-row">
              <span class="detail-price ${listing.costType === "discount" ? "discount" : ""}">${escapeHtml(displayCost(listing))}</span>
              ${conditionalBadge(listing)}
            </div>
            <h2 id="detailTitle" aria-label="${escapeHtml(listing.title)}">${detailTitleContent(listing)}</h2>
            <p class="detail-overview">${escapeHtml(listing.overview || listing.summary)}</p>
            <div class="detail-primary-facts">
              <p><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg><strong>${escapeHtml(listing.dateLabel)}</strong></p>
              <p><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg><strong>${escapeHtml(listing.venue)}</strong><span>${escapeHtml(listing.city)}</span></p>
              ${isAllDfw() ? "" : `<p><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M5 17l2-7h10l2 7M8 17v2M16 17v2"/></svg><strong>${escapeHtml(t("approxDistance", { distance }))}</strong></p>`}
            </div>
            <div class="detail-action-row">
              <a href="${escapeHtml(mapUrl(listing))}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("directions"))}</a>
              <a class="official-action" href="${escapeHtml(listing.actionUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("officialSite"))} ↗</a>
            </div>
          </section>
        </div>
        <div class="detail-content-grid">
          <main class="detail-story">
            ${
              highlights.length
                ? `<section class="detail-section highlights-section">
              <span class="detail-section-kicker">${escapeHtml(t("atAGlance"))}</span>
              <h3>${escapeHtml(t("whyWorthIt"))}</h3>
              <div class="detail-highlight-list">
                ${highlights
                  .map(
                    (highlight, index) => `
                  <article class="detail-highlight">
                    <span class="detail-highlight-mark">${String(index + 1).padStart(2, "0")}</span>
                    <p>${escapeHtml(highlight)}</p>
                  </article>`,
                  )
                  .join("")}
              </div>
            </section>`
                : ""
            }
            ${
              description.length
                ? `<section class="detail-section experience-section">
              <span class="detail-section-kicker">${escapeHtml(t("experienceKicker"))}</span>
              <h3>${escapeHtml(t("whatToExpect"))}</h3>
              <div class="detail-description">${description.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>
            </section>`
                : ""
            }
          </main>
          <aside class="detail-sidebar">
            <section class="detail-section visit-section">
              <span class="detail-section-kicker">${escapeHtml(t("visitSnapshot"))}</span>
              <h3>${escapeHtml(t("planVisit"))}</h3>
              <div class="visit-fact-grid">
                <article class="visit-fact">
                  <span class="visit-fact-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V7Z"/><path d="M12 7v12"/></svg></span>
                  <div><span>${escapeHtml(t("dealCost"))}</span><strong>${escapeHtml(listing.cost)}</strong></div>
                </article>
                ${
                  bookingDetail
                    ? `<article class="visit-fact">
                  <span class="visit-fact-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5 11 15l4.8-6"/></svg></span>
                  <div><span>${escapeHtml(t("entryDetails"))}</span><strong>${escapeHtml(bookingDetail)}</strong></div>
                </article>`
                    : ""
                }
                ${
                  eligibilityDetail
                    ? `<article class="visit-fact eligibility-fact">
                  <span class="visit-fact-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20c.8-4 3.1-6 7-6s6.2 2 7 6"/></svg></span>
                  <div><span>${escapeHtml(t("eligibilityDetails"))}</span><strong>${escapeHtml(eligibilityDetail)}</strong></div>
                </article>`
                    : ""
                }
                <article class="visit-fact">
                  <span class="visit-fact-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg></span>
                  <div><span>${escapeHtml(t("addressLabel"))}</span><strong>${escapeHtml(listing.address)}</strong></div>
                </article>
              </div>
              ${
                practicalTips.length
                  ? `
                <section class="practical-tips" aria-labelledby="practicalTipsTitle">
                  <h4 id="practicalTipsTitle">${escapeHtml(t("practicalTips"))}</h4>
                  <ul class="practical-tip-list">
                    ${practicalTips.map((tip) => `<li><span aria-hidden="true">✓</span><p>${escapeHtml(tip)}</p></li>`).join("")}
                  </ul>
                </section>`
                  : ""
              }
              ${
                listing.finePrint
                  ? `<aside class="before-callout">
                <span class="before-callout-mark" aria-hidden="true">!</span>
                <div><h4>${escapeHtml(t("beforeGo"))}</h4><p>${escapeHtml(listing.finePrint)}</p></div>
              </aside>`
                  : ""
              }
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
                  ${listing.sources
                    .map(
                      (source, index) => `
                    <a class="source-item" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
                      <span class="source-index">0${index + 1}</span>
                      <span class="source-copy"><strong>${escapeHtml(source.name)} · ${escapeHtml(source.official ? t("official") : t("supporting"))}</strong><small>${escapeHtml(source.note)}</small></span>
                      <span>↗</span>
                    </a>`,
                    )
                    .join("")}
                </div>
              </details>
            </section>
          </aside>
        </div>
        ${
          similar.length
            ? `
          <section class="detail-section similar-section">
            <h3>${escapeHtml(t("similarNearby"))}</h3>
            <div class="similar-list">${similar.map(similarTemplate).join("")}</div>
          </section>`
            : ""
        }
      </article>`;
  }

  function methodologyTemplate(researchNote) {
    return `
      <section class="detail-hero methodology-hero">
        <div class="detail-hero-copy">
          <span class="price-badge">${escapeHtml(t("methodologyBadge"))}</span>
          <h2 id="detailTitle">${escapeHtml(t("methodologyTitle"))}</h2>
        </div>
      </section>
      <div class="detail-body">
        <div class="detail-facts">
          <div class="detail-fact"><small>${escapeHtml(t("dataDate"))}</small><strong>${escapeHtml(researchNote.verifiedAt)}</strong></div>
          <div class="detail-fact"><small>${escapeHtml(t("minimumSources"))}</small><strong>${escapeHtml(t("officialFirst"))}</strong></div>
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
  }

  return { cardTemplate, detailTemplate, methodologyTemplate, sectionTemplate };
}
