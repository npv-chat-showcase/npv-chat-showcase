/* Runs only inside the existing NoPixel overlay. Session credentials stay here. */
(() => {
  if (!location.pathname.endsWith("/video_overlay.html")) return;
  const REQUEST = "npv-showcase:request:v1";
  const RESPONSE = "npv-showcase:response:v1";
  const READY = "npv-showcase:ready:v1";
  const API = "https://nopixel.streamingtoolsmith.com";
  const CLIENT_ID = "nstuq90nghenyqwqme61jgvmtp253a";
  let catalogPromise = null;
  let chain = Promise.resolve();
  let nextRequestAt = 0;
  let cooldownUntil = 0;
  const cache = new Map();

  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(detail) }));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const ready = () => Boolean(window.Twitch?.ext?.viewer?.sessionToken && window.Twitch?.ext?.viewer?.helixToken);
  async function get(url, headers) {
    const response = await fetch(url, { method: "GET", headers, credentials: "omit", signal: AbortSignal.timeout(10000) });
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After"));
      cooldownUntil = Date.now() + Math.max(30000, Number.isFinite(seconds) ? seconds * 1000 : 30000);
      throw new Error("Card lookups are temporarily rate limited. Try again shortly.");
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("NoPixel session is unavailable. Refresh Twitch with the NoPixel overlay enabled.");
      throw new Error(`NoPixel lookup failed (${response.status}).`);
    }
    return response.json();
  }
  function ebs(path) {
    return get(API + path, { Authorization: `Bearer ${window.Twitch.ext.viewer.sessionToken}` });
  }
  // userId comes from the page's saved login -> ID map; it skips the Twitch Helix request.
  async function lookup(name, knownId) {
    if (!ready()) throw new Error("Open a live NoPixel stream with its companion overlay enabled.");
    if (Date.now() < cooldownUntil) throw new Error("Card lookups are temporarily rate limited. Try again shortly.");
    const entry = cache.get(name);
    if (entry && entry.until > Date.now()) return entry.value;
    const user = /^\d{1,20}$/.test(knownId || "") ? { id: knownId, display_name: name } : (await get(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(name)}`,
      { "Client-ID": CLIENT_ID, Authorization: `Extension ${window.Twitch.ext.viewer.helixToken}` })).data?.[0];
    if (!user) return { login: name, cards: [] };
    if (!/^\d+$/.test(String(user.id))) throw new Error("Twitch returned an unfamiliar user ID.");
    const display = NpvShowcase.array(await ebs(`/cards/display-cases/${user.id}`));
    let cards = [];
    if (display.length) {
      if (!catalogPromise) catalogPromise = ebs("/cards").catch(error => { catalogPromise = null; throw error; });
      cards = NpvShowcase.cards(display, await catalogPromise);
    }
    const value = { login: name, displayName: String(user.display_name || name), userId: String(user.id), cards };
    cache.set(name, { value, until: Date.now() + 300000 });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return value;
  }
  window.addEventListener(REQUEST, event => {
    let message;
    try { message = JSON.parse(event.detail); } catch { return; }
    const name = NpvShowcase.login(message?.login);
    if (!name || !/^[a-z0-9-]{1,80}$/i.test(message?.id || "")) return;
    chain = chain.catch(() => {}).then(async () => {
      try {
        const cached = cache.get(name);
        if (!cached || cached.until <= Date.now()) {
          await sleep(Math.max(0, nextRequestAt - Date.now()));
          nextRequestAt = Date.now() + 1000;
        }
        emit(RESPONSE, { id: message.id, ok: true, value: await lookup(name, message.userId) });
      } catch (error) {
        emit(RESPONSE, { id: message.id, ok: false, error: error.message });
      }
    });
  });
  // The helper has a single onAuthorized listener, owned by NoPixel. Never replace it.
  // sessionToken / helixToken are the helper's current public viewer session properties.
  const start = setInterval(() => {
    if (!ready()) return;
    clearInterval(start);
    emit(READY, { ready: true });
  }, 100);
  // Re-announcing readiness also recovers after Chrome suspends the service worker.
  setInterval(() => { if (ready()) emit(READY, { ready: true }); }, 15000);
})();
