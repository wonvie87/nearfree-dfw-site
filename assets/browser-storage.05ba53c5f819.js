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

export function createBrowserStorage(candidate) {
  const storage = availableStorage(candidate);
  return {
    read(key, fallback = null) {
      if (!storage) return fallback;
      try {
        const value = storage.getItem(key);
        return value === null ? fallback : value;
      } catch {
        return fallback;
      }
    },
    readJson(key, fallback = null) {
      const value = this.read(key, null);
      if (value === null) return fallback;
      try { return JSON.parse(value); } catch { return fallback; }
    },
    write(key, value) {
      if (!storage) return false;
      try {
        storage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    writeJson(key, value) {
      return this.write(key, JSON.stringify(value));
    }
  };
}
