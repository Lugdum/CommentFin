/**
 * Thin client for the Comment Track plugin REST API.
 *
 * URLs are RELATIVE on purpose. The bundle is served from whichever Jellyfin
 * origin the viewer is browsing, and a server can be reachable on more than
 * one hostname. Prefixing with ApiClient.serverAddress() would pin requests to
 * one of them, making the call cross-origin and tripping CORS on the plugin
 * routes whenever the viewer is on a different hostname.
 */

const BASE = '/CommentTrack';

function authHeaders() {
  const token = window.ApiClient?.accessToken?.();
  return token ? { 'X-Emby-Token': token } : {};
}

/** An HTTP failure from the API, with the numeric status attached. */
class ApiError extends Error {
  constructor(action, status) {
    super(`${action} ${status}`);
    this.status = status;
  }
}

/** @returns {Promise<Array<{id,itemId,positionMs,body,userName,createdAt,mine}>>} */
export async function getComments(itemId) {
  const res = await fetch(`${BASE}/comments?itemId=${encodeURIComponent(itemId)}`, {
    headers: authHeaders(),
    credentials: 'same-origin',
  });
  if (!res.ok) throw new ApiError('getComments', res.status);
  return res.json();
}

/** @returns {Promise<object>} the created comment DTO */
export async function postComment(itemId, positionMs, body) {
  const res = await fetch(`${BASE}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'same-origin',
    body: JSON.stringify({ itemId, positionMs: Math.round(positionMs), body }),
  });
  if (!res.ok) throw new ApiError('postComment', res.status);
  return res.json();
}

/** Every comment the current user authored, across all media. */
export async function getMyComments() {
  const res = await fetch(`${BASE}/comments/mine`, { headers: authHeaders(), credentials: 'same-origin' });
  if (!res.ok) throw new ApiError('getMyComments', res.status);
  return res.json();
}

/** The most recent comments across every item, for moderation. Admin only. */
export async function getAllComments() {
  const res = await fetch(`${BASE}/comments/all`, { headers: authHeaders(), credentials: 'same-origin' });
  if (!res.ok) throw new ApiError('getAllComments', res.status);
  return res.json();
}

/** Edit a comment's text (author or admin). */
export async function updateComment(id, body) {
  const res = await fetch(`${BASE}/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'same-origin',
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new ApiError('updateComment', res.status);
}

/** Delete a comment (author or admin). 404 is treated as success (already gone). */
export async function deleteComment(id) {
  const res = await fetch(`${BASE}/comments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'same-origin',
  });
  if (!res.ok && res.status !== 404) throw new ApiError('deleteComment', res.status);
}

/** URL for a user's profile picture, sized for the comment bubble. Relative
 * (same-origin, see the note above) with the token as a query param, since an
 * <img src> can't carry a custom header. Returns a 404 when the user has no
 * picture set, and overlay.js then falls back to an initial-letter avatar. */
export function avatarUrl(userId, sizePx = 64) {
  const token = window.ApiClient?.accessToken?.();
  const q = new URLSearchParams({ quality: '90', height: String(Math.round(sizePx)) });
  if (token) q.set('api_key', token);
  return `/Users/${encodeURIComponent(userId)}/Images/Primary?${q.toString()}`;
}

/** The viewer's synced settings, or null if they've never saved any. */
export async function getPrefs() {
  const res = await fetch(`${BASE}/prefs`, { headers: authHeaders(), credentials: 'same-origin' });
  if (res.status === 204) return null;
  if (!res.ok) throw new ApiError('getPrefs', res.status);
  return res.json();
}

/** Persists the viewer's settings so every device/browser on this account sees them. */
export async function putPrefs(settingsObj) {
  const res = await fetch(`${BASE}/prefs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'same-origin',
    body: JSON.stringify(settingsObj),
  });
  if (!res.ok) throw new ApiError('putPrefs', res.status);
}

/** Whether the signed-in user is a Jellyfin administrator. Queried with a
 * relative URL rather than ApiClient.getCurrentUser(), because that method
 * builds its request from ApiClient's configured serverAddress(), which can
 * differ from the page's actual origin when the server answers on more than
 * one hostname, and then fails silently as a cross-origin request. */
export async function isCurrentUserAdmin() {
  const userId = window.ApiClient?.getCurrentUserId?.();
  if (!userId) return false;
  try {
    const res = await fetch(`/Users/${encodeURIComponent(userId)}`, {
      headers: authHeaders(),
      credentials: 'same-origin',
    });
    if (!res.ok) return false;
    const user = await res.json();
    return !!(user?.Policy?.IsAdministrator ?? user?.policy?.isAdministrator);
  } catch (e) {
    console.warn('[CommentTrack] admin check failed', e);
    return false;
  }
}

/** Item ids (as strings) mapped to their non-deleted comment count. Only the
 * ids passed in are counted, never the whole database. */
export async function getCommentCounts(itemIds) {
  if (!itemIds?.length) return {};
  const res = await fetch(`${BASE}/comments/counts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'same-origin',
    body: JSON.stringify({ itemIds }),
  });
  if (!res.ok) throw new ApiError('getCommentCounts', res.status);
  return res.json();
}

/** Server + default-settings config. Falls back to sane values if unreachable
 * (settings.js's own DEFAULTS then take over for the per-viewer defaults). */
export async function getPublicConfig() {
  try {
    const res = await fetch(`${BASE}/config`, { headers: authHeaders(), credentials: 'same-origin' });
    if (res.ok) return res.json();
  } catch { /* ignore */ }
  return { maxCommentLength: 200, allowAllUsersToPost: true, defaults: {} };
}
