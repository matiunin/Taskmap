/**
 * Secure storage utility for sensitive data.
 * Uses simple base64 encoding with prefix for obfuscation.
 * For highly sensitive data, use sessionStorage instead of localStorage.
 */

const SECURE_PREFIX = 'SECURE_v1_';

/**
 * Encodes sensitive data using base64 + prefix
 * NOT cryptographically secure, but prevents casual inspection
 */
function encodeValue(value: string): string {
  try {
    const encoded = btoa(value);
    return SECURE_PREFIX + encoded;
  } catch {
    return '';
  }
}

/**
 * Decodes previously encoded sensitive data
 */
function decodeValue(encoded: string): string {
  try {
    if (!encoded.startsWith(SECURE_PREFIX)) {
      return encoded; // Not encoded, return as-is
    }
    const withoutPrefix = encoded.slice(SECURE_PREFIX.length);
    return atob(withoutPrefix);
  } catch {
    return '';
  }
}

/**
 * Session storage scoped to the browser tab (browser restore may retain it)
 * Base64 is reversible encoding, not encryption. The proxy receives credentials for Jira requests.
 */
export const secureSessionStorage = {
  setItem(key: string, value: string): void {
    try {
      const encoded = encodeValue(value);
      sessionStorage.setItem(key, encoded);
    } catch (error) {
    }
  },

  getItem(key: string): string | null {
    try {
      const encoded = sessionStorage.getItem(key);
      if (!encoded) return null;
      return decodeValue(encoded);
    } catch (error) {
      return null;
    }
  },

  removeItem(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
    }
  },

  clear(): void {
    try {
      sessionStorage.clear();
    } catch (error) {
    }
  },
};
