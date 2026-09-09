const STORAGE_KEY = "agroprognoz.database.v1";

export function isElectronEnv() {
  return Boolean(window.bridge && window.bridge.database && typeof window.bridge.database.load === "function");
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function loadDatabaseBytes() {
  try {
    if (isElectronEnv()) {
      const result = await window.bridge.database.load();
      if (result && result instanceof Uint8Array && result.length > 0) {
        return result;
      }
      if (result && result.buffer) {
        const array = new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
        if (array.length > 0) {
          return array;
        }
      }
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return base64ToBytes(raw);
  } catch {
    return null;
  }
}

export async function saveDatabaseBytes(bytes) {
  try {
    if (isElectronEnv()) {
      await window.bridge.database.save(bytes);
      return true;
    }
    localStorage.setItem(STORAGE_KEY, bytesToBase64(bytes));
    return true;
  } catch {
    return false;
  }
}
