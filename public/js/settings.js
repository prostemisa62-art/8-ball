const KEY = 'billiards.settings.v1';
const NAME_KEY = 'billiards.name';
export const defaults = { sound: true, music: false, volume: 0.7, table: 'green', quality: 'high' };

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export const settings = { ...defaults, ...load() };
const listeners = [];
export const onSettings = (fn) => listeners.push(fn);
export function update(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* soukromý režim */ }
  listeners.forEach((fn) => fn(settings));
}
export function getName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } }
export function setName(n) { try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ } }
export const session = {
  get() { try { return JSON.parse(sessionStorage.getItem('billiards.session')); } catch { return null; } },
  set(v) { try { sessionStorage.setItem('billiards.session', JSON.stringify(v)); } catch { /* ignore */ } },
  clear() { try { sessionStorage.removeItem('billiards.session'); } catch { /* ignore */ } },
};
