// Bearer token for the current tab. sessionStorage: cleared when the tab closes.
const STORAGE_KEY = 'attendance.token';

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage blocked: the session simply won't survive a reload
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
