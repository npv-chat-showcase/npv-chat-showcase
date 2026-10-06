// Firefox provides the promise-based `browser` namespace; Chrome provides `chrome` (and `browser` in newer versions).
const api = globalThis.browser ?? globalThis.chrome;
const frames = new Map();
const ORIGIN = "https://nstuq90nghenyqwqme61jgvmtp253a.ext-twitch.tv";
function frameSender(sender) {
  try {
    const url = new URL(sender.url);
    return sender.tab?.id !== undefined && sender.frameId > 0 && url.origin === ORIGIN && url.pathname.endsWith("/video_overlay.html");
  } catch { return false; }
}
function twitchSender(sender) {
  try { return sender.tab?.id !== undefined && sender.frameId === 0 && new URL(sender.url).origin === "https://www.twitch.tv"; }
  catch { return false; }
}
api.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === "npv:frame-ready" && frameSender(sender)) {
    frames.set(sender.tab.id, sender.frameId);
    api.tabs.sendMessage(sender.tab.id, { type: "npv:ready" }, { frameId: 0 }).catch(() => {});
    respond({ ok: true });
    return;
  }
  if (!twitchSender(sender)) return;
  if (message?.type === "npv:status") {
    respond({ ready: frames.has(sender.tab.id) });
    return;
  }
  if (message?.type !== "npv:lookup" || !/^[a-z0-9_]{1,25}$/.test(message.login || "")) return;
  const frameId = frames.get(sender.tab.id);
  if (frameId === undefined) {
    respond({ ok: false, error: "Open a live NoPixel stream with the companion overlay enabled." });
    return;
  }
  const userId = /^\d{1,20}$/.test(message.userId || "") ? message.userId : undefined;
  api.tabs.sendMessage(sender.tab.id, { type: "npv:frame-lookup", login: message.login, userId }, { frameId })
    .then(respond)
    .catch(() => {
      frames.delete(sender.tab.id);
      respond({ ok: false, error: "The NoPixel companion is reconnecting. Refresh the stream and try again." });
    });
  return true;
});
// Test builds 0.1.4-0.2.0 kept a temporary card log; remove it on update.
api.runtime.onInstalled.addListener(() => { api.storage.local.remove(["npvDebugLog", "npvDebugCatalog"]).catch(() => {}); });
api.tabs.onRemoved.addListener(tabId => frames.delete(tabId));
api.tabs.onUpdated.addListener((tabId, change) => { if (change.status === "loading") frames.delete(tabId); });
