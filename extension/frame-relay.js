(() => {
  // Firefox provides the promise-based `browser` namespace; Chrome provides `chrome` (and `browser` in newer versions).
  const api = globalThis.browser ?? globalThis.chrome;
  if (!location.pathname.endsWith("/video_overlay.html")) return;
  const pending = new Map();
  const announce = () => api.runtime.sendMessage({ type: "npv:frame-ready" }).catch(() => {});
  window.addEventListener("npv-showcase:ready:v1", event => {
    try { if (JSON.parse(event.detail).ready) announce(); } catch {}
  });
  window.addEventListener("npv-showcase:response:v1", event => {
    let reply;
    try { reply = JSON.parse(event.detail); } catch { return; }
    const request = pending.get(reply?.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(reply.id);
    request.respond(reply);
  });
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== api.runtime.id || message?.type !== "npv:frame-lookup") return;
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      respond({ ok: false, error: "The NoPixel companion did not answer. Refresh the stream and try again." });
    }, 40000);
    pending.set(id, { respond, timer });
    window.dispatchEvent(new CustomEvent("npv-showcase:request:v1", {
      detail: JSON.stringify({ id, login: message.login, userId: message.userId })
    }));
    return true;
  });
})();
