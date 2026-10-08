// Bearer token. sessionStorage by default (cleared when the tab closes); localStorage when the user
// chose "Recordarme en este teléfono" (a 30-day session; signing out or a password reset revokes it).
const STORAGE_KEY = 'attendance.token';

const stores = () => [sessionStorage, localStorage];

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string, remember = false): void {
  try {
    clearToken();
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, token);
  } catch {
    // Storage blocked: the session simply won't survive a reload
  }
}

export function clearToken(): void {
  try {
    for (const s of stores()) s.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// "Open as support" from the admin dashboard arrives as <school>/#support=<token>. The fragment never
// reaches a server; it is removed from the address bar (and history) right away.
export function takeSupportToken(): void {
  const match = /^#support=(st_[\w-]+)$/.exec(window.location.hash);
  if (!match) return;
  setToken(match[1]);
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
