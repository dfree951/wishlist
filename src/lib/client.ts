const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN || '';
const sessionKey = 'wishlist-owner-session';
let memoryToken = '';
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export function setSessionToken(token: string) {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(sessionKey, token);
    else sessionStorage.removeItem(sessionKey);
  } catch { /* Memory-only sessions still work when storage is unavailable. */ }
}
export async function apiFetch(path: string, options?: RequestInit) {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path.');
  const headers = new Headers(options?.headers);
  if (apiOrigin) {
    try { memoryToken = sessionStorage.getItem(sessionKey) || memoryToken; } catch { /* Use memory. */ }
    if (memoryToken) headers.set('Authorization', `Bearer ${memoryToken}`);
    headers.set('X-Session-Mode', 'bearer');
  }
  const response = await fetch(`${apiOrigin}${path}`, {
    ...options, headers, cache: 'no-store', credentials: apiOrigin ? 'omit' : 'same-origin',
  });
  if (response.status === 401) setSessionToken('');
  return response;
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set('Content-Type', 'application/json');
  const response = await apiFetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({ error: 'The server did not respond. Please try again.' }));
  if (!response.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', response.status);
  return data;
}
export function messageOf(e: unknown) { return e instanceof Error ? e.message : 'Something went wrong. Please try again.'; }
