/**
 * @typedef {object} StorageLike
 * @property {(key: string) => string | null} getItem
 * @property {(key: string) => void} removeItem
 * @property {(key: string, value: string) => void} setItem
 */

/**
 * Confirm that a storage implementation is writable before using it.
 *
 * @param {StorageLike | null | undefined} candidate
 * @returns {StorageLike | null}
 */
function availableStorage(candidate) {
  try {
    const storage = candidate ?? globalThis.window?.localStorage;
    if (!storage) return null;
    const probe = "__nearfree_storage_probe__";
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/**
 * Create a failure-isolating adapter for optional browser persistence.
 *
 * @param {StorageLike | null | undefined} [candidate]
 */
export function createBrowserStorage(candidate) {
  const storage = availableStorage(candidate);

  /**
   * @param {string} key
   * @param {unknown} [fallback=null]
   * @returns {unknown}
   */
  function read(key, fallback = null) {
    if (!storage) return fallback;
    try {
      const value = storage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  /**
   * @param {string} key
   * @param {string} value
   * @returns {boolean}
   */
  function write(key, value) {
    if (!storage) return false;
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  return {
    read,
    /**
     * @param {string} key
     * @param {unknown} [fallback=null]
     * @returns {unknown}
     */
    readJson(key, fallback = null) {
      const value = read(key, null);
      if (typeof value !== "string") return fallback;
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    },
    write,
    /**
     * @param {string} key
     * @param {unknown} value
     * @returns {boolean}
     */
    writeJson(key, value) {
      return write(key, JSON.stringify(value));
    },
  };
}
