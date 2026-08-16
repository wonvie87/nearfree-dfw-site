import { createBrowserStorage } from "./browser-storage.aba7afe3e62a.js";

const storage = createBrowserStorage();
const body = document.body;
/** @type {HTMLSelectElement | null} */
const languageSelect = document.querySelector("#listingPageLanguage");
/** @type {HTMLButtonElement | null} */
const saveButton = document.querySelector("#listingPageSave");
/** @type {HTMLButtonElement | null} */
const shareButton = document.querySelector("#listingPageShare");
/** @type {HTMLElement | null} */
const savedCount = document.querySelector("#listingPageSavedCount");
/** @type {HTMLElement | null} */
const toast = document.querySelector("#listingPageToast");
/** @type {HTMLMetaElement | null} */
const description = document.querySelector("meta[name='description']");
const listingId = body.dataset.listingId || "";
const storedSaved = storage.readJson("nearfree-saved");
const saved = new Set(Array.isArray(storedSaved) ? storedSaved : []);
let locale = storage.read("nearfree-locale") === "ko" ? "ko" : "en";
/** @type {number | undefined} */
let toastTimer;

/** @param {HTMLElement | null} element @param {string} prefix */
function localizedDataset(element, prefix) {
  const key = `${prefix}${locale[0].toUpperCase()}${locale.slice(1)}`;
  return element?.dataset[key] || "";
}

/** @param {string} message */
function showToast(message) {
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function updateSavedUi() {
  const isSaved = saved.has(listingId);
  saveButton?.classList.toggle("saved", isSaved);
  const label = localizedDataset(body, isSaved ? "unsave" : "save");
  if (saveButton && label) {
    saveButton.setAttribute("aria-label", label);
    const text = saveButton.querySelector("span");
    if (text) text.textContent = label;
  }
  if (savedCount) {
    savedCount.textContent = String(saved.size);
    savedCount.hidden = saved.size === 0;
  }
}

/** @param {string} nextLocale */
function applyLocale(nextLocale) {
  if (!["en", "ko"].includes(nextLocale)) return;
  locale = nextLocale;
  storage.write("nearfree-locale", locale);
  document.documentElement.lang = locale;
  if (languageSelect) languageSelect.value = locale;

  document.querySelectorAll("[data-copy-en]").forEach((element) => {
    const target = /** @type {HTMLElement} */ (element);
    const copy = localizedDataset(target, "copy");
    if (copy) target.textContent = copy;
  });
  document.querySelectorAll("[data-aria-en]").forEach((element) => {
    const target = /** @type {HTMLElement} */ (element);
    const label = localizedDataset(target, "aria");
    if (label) target.setAttribute("aria-label", label);
  });
  document.querySelectorAll("[data-listing-locale]").forEach((element) => {
    const target = /** @type {HTMLElement} */ (element);
    target.hidden = target.dataset.listingLocale !== locale;
  });

  const title = localizedDataset(body, "title");
  const summary = localizedDataset(body, "description");
  if (title) document.title = title;
  if (description && summary) description.content = summary;
  updateSavedUi();
}

function toggleSave() {
  const removing = saved.has(listingId);
  if (removing) saved.delete(listingId);
  else saved.add(listingId);
  storage.writeJson("nearfree-saved", [...saved]);
  updateSavedUi();
  showToast(localizedDataset(body, removing ? "saveRemoved" : "saveAdded"));
}

async function shareListing() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  const shareData = { title: document.title, url: url.href };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(`${shareData.title}\n${shareData.url}`);
      showToast(localizedDataset(body, "linkCopied"));
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      showToast(localizedDataset(body, "shareFailed"));
    }
  }
}

languageSelect?.addEventListener("change", () => applyLocale(languageSelect.value));
saveButton?.addEventListener("click", toggleSave);
shareButton?.addEventListener("click", shareListing);
applyLocale(locale);
