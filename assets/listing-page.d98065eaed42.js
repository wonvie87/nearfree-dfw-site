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
const listingId = body.dataset.listingId || "";
const storedSaved = storage.readJson("nearfree-saved");
const saved = new Set(Array.isArray(storedSaved) ? storedSaved : []);
const locale = body.dataset.locale === "ko" ? "ko" : "en";
/** @type {number | undefined} */
let toastTimer;

/** @param {string} key */
function pageCopy(key) {
  return body.dataset[key] || "";
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
  const label = pageCopy(isSaved ? "unsave" : "save");
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
function switchLocale(nextLocale) {
  if (!["en", "ko"].includes(nextLocale)) return;
  storage.write("nearfree-locale", nextLocale);
  const target = nextLocale === "ko" ? body.dataset.alternateKo : body.dataset.alternateEn;
  if (target && target !== body.dataset.canonicalUrl) window.location.assign(target);
}

function toggleSave() {
  const removing = saved.has(listingId);
  if (removing) saved.delete(listingId);
  else saved.add(listingId);
  storage.writeJson("nearfree-saved", [...saved]);
  updateSavedUi();
  showToast(pageCopy(removing ? "saveRemoved" : "saveAdded"));
}

async function shareListing() {
  const url = new URL(body.dataset.canonicalUrl || window.location.href);
  const shareData = { title: document.title, url: url.href };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(`${shareData.title}\n${shareData.url}`);
      showToast(pageCopy("linkCopied"));
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      showToast(pageCopy("shareFailed"));
    }
  }
}

if (languageSelect) languageSelect.value = locale;
storage.write("nearfree-locale", locale);
languageSelect?.addEventListener("change", () => switchLocale(languageSelect.value));
saveButton?.addEventListener("click", toggleSave);
shareButton?.addEventListener("click", shareListing);
updateSavedUi();
