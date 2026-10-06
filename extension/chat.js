(() => {
  // Firefox provides the promise-based `browser` namespace; Chrome provides `chrome` (and `browser` in newer versions).
  const api = globalThis.browser ?? globalThis.chrome;
  const USER = '[data-a-target="chat-message-username"][data-a-user], .seventv-chat-user-username';
  const POPUP = '[data-a-target="viewer-card"], [data-test-selector="viewer-card"], .viewer-card, .seventv-user-card';
  const FRESH = 15 * 60000;
  const KEEP = 24 * 3600000;
  const ID_KEEP = 30 * 86400000;
  const SAVED = 'npvSaved';
  const cache = new Map();
  const ids = new Map();
  const queued = new Map();
  const inFlight = new Map();
  let ready = false;
  let active = false;
  let lastClick = null;
  let scanTimer = null;
  // 7TV can keep several user cards open; each gets its own panel.
  const panels = new Map();
  let retryAt = 0;
  let nextLookupAt = 0;
  let pumpTimer = null;
  let lastError = null;
  let lastLookup = null;
  let saveTimer = null;

  function username(label) {
    if (!label) return null;
    const fromData = NpvShowcase.login(label.dataset.aUser);
    if (fromData) return fromData;
    // 7TV renders international display names as "Display name (login)".
    const text = label.textContent.trim().replace(/^@/, '');
    return NpvShowcase.login(text.match(/\(([a-z0-9_]{1,25})\)$/i)?.[1] || text);
  }
  function chatLabels() {
    return [...document.querySelectorAll(USER)].filter(label => !label.closest(POPUP));
  }

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function remember(name, reply, at = Date.now()) {
    const previous = cache.get(name);
    if (!reply.ok && previous?.reply.ok && previous.keep > Date.now()) {
      // Keep showing the saved display; just back off before asking again.
      previous.until = Date.now() + 15000;
      return;
    }
    cache.delete(name);
    cache.set(name, { reply, at, until: at + (reply.ok ? FRESH : 15000), keep: reply.ok ? at + KEEP : at + 15000 });
    if (cache.size > 3000) cache.delete(cache.keys().next().value);
    if (reply.ok) {
      const userId = reply.value?.userId;
      if (/^\d{1,20}$/.test(userId || '')) ids.set(name, [userId, at]); else ids.delete(name);
      scheduleSave();
    }
  }
  // Fresh results skip lookups; known results (saved up to a day) still show badges while they refresh.
  function cached(name) {
    const entry = cache.get(name);
    return entry && entry.until > Date.now() ? entry.reply : null;
  }
  function known(name) {
    const entry = cache.get(name);
    return entry && entry.keep > Date.now() ? entry.reply : null;
  }
  function savedState() {
    const displays = {};
    for (const [name, entry] of cache) {
      if (!entry.reply.ok || entry.keep <= Date.now()) continue;
      const { login, displayName, cards } = entry.reply.value;
      displays[name] = { at: entry.at, value: { login, displayName, cards } };
    }
    return { v: 1, displays, ids: Object.fromEntries(ids) };
  }
  function scheduleSave() {
    if (!api.storage?.local || saveTimer) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      try {
        // Merge with other Twitch tabs' saves; the newest result per viewer wins.
        const stored = (await api.storage.local.get(SAVED))[SAVED];
        const mine = savedState();
        const now = Date.now();
        const theirs = Object.entries(stored?.v === 1 ? stored.displays : {})
          .filter(([name, entry]) => entry.at + KEEP > now && !(mine.displays[name]?.at >= entry.at));
        const displays = Object.fromEntries([...theirs, ...Object.entries(mine.displays)]
          .sort((a, b) => a[1].at - b[1].at).slice(-3000));
        const allIds = Object.fromEntries(Object.entries({ ...(stored?.v === 1 ? stored.ids : {}), ...mine.ids })
          .filter(([, [, at]]) => at + ID_KEEP > now).slice(-5000));
        await api.storage.local.set({ [SAVED]: { v: 1, displays, ids: allIds } });
      } catch (error) { console.warn('[NpV] could not save card displays', error); }
    }, 10000);
  }
  async function loadSaved() {
    if (!api.storage?.local) return;
    try {
      const stored = (await api.storage.local.get(SAVED))[SAVED];
      if (stored?.v !== 1) return;
      const now = Date.now();
      for (const [name, [userId, at]] of Object.entries(stored.ids || {})) {
        if (NpvShowcase.login(name) === name && /^\d{1,20}$/.test(userId) && at + ID_KEEP > now && !ids.has(name)) ids.set(name, [userId, at]);
      }
      for (const [name, entry] of Object.entries(stored.displays || {})) {
        if (NpvShowcase.login(name) !== name || cache.has(name) || !(entry?.at + KEEP > now) || !Array.isArray(entry.value?.cards)) continue;
        cache.set(name, { reply: { ok: true, value: entry.value }, at: entry.at, until: entry.at + FRESH, keep: entry.at + KEEP });
      }
      scheduleScan();
    } catch (error) { console.warn('[NpV] could not load saved card displays', error); }
  }
  function request(name, priority = false) {
    const result = cached(name);
    if (result) return Promise.resolve(result);
    if (inFlight.has(name)) return inFlight.get(name);
    let entry = queued.get(name);
    if (!entry) {
      // Keep a busy stream from building an unlimited background backlog.
      if (!priority && queued.size >= 50) return Promise.resolve(null);
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      entry = { promise, resolve, priority, refresh: Boolean(known(name)) };
      queued.set(name, entry);
    } else if (priority) entry.priority = true;
    pump();
    return entry.promise;
  }
  async function pump() {
    if (active || !ready || !queued.size) return;
    const delay = Math.max(retryAt, nextLookupAt) - Date.now();
    if (delay > 0) {
      if (!pumpTimer) pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, delay);
      return;
    }
    active = true;
    nextLookupAt = Date.now() + 1000;
    // Viewer cards first, then people with no badge yet, then refreshes of saved badges.
    const [name, entry] = [...queued].find(([, value]) => value.priority) || [...queued].find(([, value]) => !value.refresh) ||
      queued.entries().next().value;
    queued.delete(name);
    inFlight.set(name, entry.promise);
    let reply;
    try { reply = await api.runtime.sendMessage({ type: "npv:lookup", login: name, userId: ids.get(name)?.[0] }); }
    catch { reply = { ok: false, error: "Reload Twitch to reconnect the extension." }; }
    reply ||= { ok: false, error: "NoPixel did not return a card lookup." };
    lastError = reply.ok ? null : reply.error;
    if (reply.ok) lastLookup = name;
    remember(name, reply);
    inFlight.delete(name);
    entry.resolve(reply);
    active = false;
    updateBadges(name, known(name) || reply);
    if (!reply.ok) {
      retryAt = Date.now() + 15000;
      // Resolve queued callers instead of leaving a viewer card stuck on Loading.
      for (const waiting of queued.values()) waiting.resolve(reply);
      queued.clear();
    }
    pump();
  }
  function updateBadges(name, reply) {
    for (const label of chatLabels()) {
      if (username(label) !== name) continue;
      updateBadge(label, name, reply);
    }
  }
  function updateBadge(label, name, reply) {
      const target = label.closest('.chat-line__username') || label;
      const previous = target.previousElementSibling;
      let badge = previous?.classList.contains('npv-showcase-badge') ? previous : null;
      if (badge && badge.dataset.npvLogin !== name) { badge.remove(); badge = null; }
      if (!reply.ok) return;
      const rank = NpvShowcase.displayRank(reply.value?.cards);
      if (!rank) { badge?.remove(); return; }
      if (badge?.dataset.tier === rank.tier) return;
      const button = badge || el('button', 'npv-showcase-badge');
      button.replaceChildren(badgeIcon(rank.tier));
      button.type = 'button';
      button.dataset.npvLogin = name;
      button.dataset.tier = rank.tier;
      button.title = `${tierName(rank.tier)} display · ${Math.round(rank.score)} pts${rank.set ? ' · set of 3' : ''}` +
        ` · ${reply.value.cards.length} NoPixel cards on display`;
      button.setAttribute('aria-label', `View ${name}'s NoPixel displayed cards (${rank.tier})`);
      if (!badge) {
        button.addEventListener('click', () => target.click());
        target.before(button);
      }
  }
  const tierName = tier => tier[0].toUpperCase() + tier.slice(1);
  // Two fanned cards; the front card carries a tier emblem so tiers differ by shape as well as color.
  const EMBLEMS = {
    common: 'M9.2 10.6h3.6M9.2 12.1h2.4',
    rare: 'M11 6.3l2 2.55-2 2.55-2-2.55z',
    epic: 'M11 5.6q.5 2.65 3 3.15-2.5.5-3 3.15-.5-2.65-3-3.15 2.5-.5 3-3.15z',
    legendary: 'M11 5.5l.85 2.23 2.38.12-1.85 1.5.62 2.3-2-1.3-2 1.3.62-2.3-1.85-1.5 2.38-.12z'
  };
  function badgeIcon(tier) {
    const svg = (tag, attributes) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      return node;
    };
    const icon = svg('svg', { viewBox: '0 0 18 18', width: '18', height: '18', 'aria-hidden': 'true', class: 'npv-showcase-icon' });
    icon.append(svg('rect', { class: 'npv-back', x: '2.6', y: '3.6', width: '8.6', height: '11.8', rx: '1.6', transform: 'rotate(-14 6.9 9.5)' }));
    const front = svg('g', { transform: 'rotate(8 11 8.75)' });
    front.append(
      svg('rect', { class: 'npv-front', x: '6.6', y: '2.6', width: '8.8', height: '12.3', rx: '1.6' }),
      svg('path', { class: 'npv-shine', d: 'M8.2 2.6h4.2L6.6 8.6V4.2a1.6 1.6 0 0 1 1.6-1.6z' }),
      svg('path', { class: tier === 'common' ? 'npv-emblem npv-lines' : 'npv-emblem', d: EMBLEMS[tier] }));
    icon.append(front);
    return icon;
  }
  function visible(node) {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
  }
  function scan() {
    scanTimer = null;
    const names = new Set();
    const visibility = [];
    for (const label of chatLabels()) {
      const name = username(label);
      if (!name) continue;
      const result = known(name);
      if (result) updateBadge(label, name, result);
      if (ready && !cached(name)) visibility.push([label, name]);
    }
    // Batch geometry reads after badge writes to avoid alternating layout and DOM work.
    for (const [label, name] of visibility) if (visible(label)) names.add(name);
    for (const [name, entry] of queued) {
      if (!entry.priority && !names.has(name)) { queued.delete(name); entry.resolve(null); }
    }
    // Newest visible messages take precedence, unbadged people before saved ones; one user per second.
    const newest = [...names].reverse();
    [...newest.filter(name => !known(name)), ...newest.filter(name => known(name))].slice(0, 50).forEach(name => request(name));
    attachPopup();
  }
  function scheduleScan() { if (document && !document.hidden && !scanTimer) scanTimer = setTimeout(scan, 500); }
  function ownNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element?.closest('.npv-showcase-panel, .npv-showcase-badge, .npv-showcase-preview'));
  }
  function relevantNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element || ownNode(node)) return false;
    return element.matches(USER + ', ' + POPUP) || Boolean(element.closest(USER + ', ' + POPUP)) ||
      Boolean(element.querySelector(USER + ', ' + POPUP));
  }
  function mutations(records) {
    for (const record of records) {
      if (ownNode(record.target)) continue;
      if (record.type !== 'childList') {
        if (relevantNode(record.target)) { scheduleScan(); return; }
        continue;
      }
      if (record.target.nodeType === Node.ELEMENT_NODE && record.target.closest(USER + ', ' + POPUP) &&
          [...record.addedNodes, ...record.removedNodes].some(node => !ownNode(node))) { scheduleScan(); return; }
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (relevantNode(node)) { scheduleScan(); return; }
      }
    }
  }
  function popupLogin(popup, fresh = true) {
    // Read the popup identity, never a username from its message history.
    const identity = popup.querySelector('.seventv-user-card-usertag');
    if (identity) {
      const name = profileLogin(identity);
      if (name) return name;
    }
    const header = popup.querySelector('.viewer-card-header__background, .seventv-user-card-identity');
    const direct = header?.querySelector('[data-a-user]');
    const fromData = NpvShowcase.login(direct?.dataset.aUser);
    if (fromData) return fromData;
    if (header) {
      // Twitch's compact viewer card may have plain header text instead of a profile link.
      const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const name = NpvShowcase.login(node.textContent);
        if (name && !['follow', 'unfollow', 'subscribe'].includes(name)) return name;
      }
    }
    for (const link of popup.querySelectorAll('a[href]')) {
      if (link.closest('.seventv-user-card-data, .chat-line__message')) continue;
      const name = profileLogin(link);
      if (name) return name;
    }
    // Twitch user popups do not always expose a profile link or a username attribute.
    return fresh && lastClick && Date.now() - lastClick.at < 3000 ? lastClick.login : null;
  }
  function profileLogin(link) {
    try {
      const url = new URL(link.href, location.href);
      if (!['www.twitch.tv', 'twitch.tv'].includes(url.hostname)) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.length === 1 ? NpvShowcase.login(parts[0]) : null;
    } catch { return null; }
  }
  function attachPopup() {
    const open = [...document.querySelectorAll(POPUP)].filter(visible);
    for (const popup of panels.keys()) if (!open.includes(popup)) panels.delete(popup);
    open.forEach(attachTo);
  }
  function attachTo(popup) {
    const current = panels.get(popup);
    const name = popupLogin(popup, !current) || current?.name;
    if (!name) return;
    if (current?.name === name && current.panel.isConnected) return;
    popup.querySelector('.npv-showcase-panel')?.remove();
    const panel = el('section', 'npv-showcase-panel');
    panel.setAttribute('aria-label', 'NoPixel displayed cards');
    panel.append(el('h3', 'npv-showcase-heading', 'NoPixel display case'));
    const body = el('div');
    panel.append(body);
    const header = popup.classList.contains('seventv-user-card') ? popup.querySelector('.seventv-user-card-header') : null;
    if (header) panel.classList.add('npv-showcase-in-7tv');
    (header || popup).append(panel);
    draggable(panel, popup);
    panels.set(popup, { panel, name });
    async function load() {
      const saved = known(name);
      if (saved?.ok) show(saved);
      else body.replaceChildren(el('p', 'npv-showcase-message', ready ? 'Loading displayed cards…' : 'Open a live NoPixel stream with its companion overlay enabled.'));
      if (!ready) return;
      const reply = await request(name, true);
      if (!reply || !panel.isConnected || panels.get(popup)?.panel !== panel) return;
      show(known(name) || reply);
    }
    function show(reply) {
      body.replaceChildren();
      if (!reply.ok) {
        body.append(el('p', 'npv-showcase-message', reply.error));
        const button = el('button', 'npv-showcase-retry', 'Try again');
        button.type = 'button';
        button.addEventListener('click', () => { cache.delete(name); retryAt = 0; load(); });
        body.append(button);
      } else if (!reply.value?.cards?.length) body.append(el('p', 'npv-showcase-message', 'No cards on display.'));
      else {
        const rank = NpvShowcase.displayRank(reply.value.cards);
        const summary = el('span', 'npv-showcase-tier', `${tierName(rank.tier)} · ${Math.round(rank.score)} pts${rank.set ? ' · set of 3' : ''}`);
        summary.dataset.tier = rank.tier;
        summary.prepend(badgeIcon(rank.tier));
        panel.querySelector('.npv-showcase-tier')?.remove();
        panel.querySelector('.npv-showcase-heading').append(summary);
        body.append(renderCards(reply.value.cards));
      }
    }
    load();
  }
  function draggable(panel, popup) {
    let down = null;
    panel.addEventListener('pointerdown', event => {
      down = { x: event.clientX, y: event.clientY };
      // 7TV only drags from its identity strip; let the panel move the card too.
      const handle = popup.querySelector('.seventv-user-card-identity');
      if (!handle || event.button !== 0 || event.target.closest('button')) return;
      event.preventDefault();
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, composed: true, pointerId: event.pointerId, pointerType: event.pointerType,
        isPrimary: event.isPrimary, button: event.button, buttons: event.buttons,
        clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY
      }));
    });
    // Releasing a drag over a card should not enlarge it.
    panel.addEventListener('click', event => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) event.stopPropagation();
      down = null;
    }, true);
  }
  function renderCards(cards) {
    const grid = el('div', 'npv-showcase-grid');
    for (const card of cards.slice(0, 3)) {
      const figure = el('figure', 'npv-showcase-card');
      const art = el('div', 'npv-showcase-art');
      art.dataset.edition = card.edition;
      const image = NpvShowcase.imageUrl(card.image);
      if (image) {
        const img = el('img');
        img.src = image;
        img.alt = card.name;
        img.referrerPolicy = 'no-referrer';
        // Native image dragging hijacks the pointer and stalls viewer-card dragging.
        img.draggable = false;
        img.addEventListener('error', () => img.replaceWith(el('span', '', 'Image unavailable')));
        art.append(img);
        art.tabIndex = 0;
        art.setAttribute('role', 'button');
        art.setAttribute('aria-label', `Enlarge ${card.name}`);
        art.addEventListener('click', () => preview(image, card.name));
        art.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); preview(image, card.name); }
        });
      } else art.append(el('span', '', card.name));
      if (card.printNumber) art.append(el('span', 'npv-showcase-print', card.printNumber));
      figure.append(art);
      const caption = el('figcaption');
      caption.append(el('span', 'npv-showcase-card-name', card.name));
      caption.append(el('span', 'npv-showcase-card-points', `+${Math.round(NpvShowcase.cardPoints(card))}`));
      caption.append(document.createTextNode(` · ${card.editionName}${card.ultraRare ? ' · Ultra rare' : ''}`));
      const pulled = new Date(card.pulledAt || NaN);
      if (!Number.isNaN(pulled.getTime())) {
        const date = el('span', 'npv-showcase-pulled', `Pulled ${pulled.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', ...(pulled.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) })}`);
        date.title = `Pulled ${pulled.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`;
        caption.append(date);
      }
      figure.append(caption);
      grid.append(figure);
    }
    return grid;
  }
  function preview(url, name) {
    const previousFocus = document.activeElement;
    const layer = el('div', 'npv-showcase-preview');
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', name);
    const image = el('img');
    image.src = url; image.alt = name; image.referrerPolicy = 'no-referrer';
    const close = el('button', '', 'Close');
    close.type = 'button';
    function finish() { layer.remove(); document.removeEventListener('keydown', onKey, true); previousFocus?.focus(); }
    function onKey(event) {
      if (event.key === 'Escape') { event.stopPropagation(); finish(); }
      if (event.key === 'Tab') { event.preventDefault(); close.focus(); }
    }
    close.addEventListener('click', finish);
    layer.addEventListener('click', event => { if (event.target === layer) finish(); });
    layer.append(image, close);
    document.body.append(layer); close.focus();
    document.addEventListener('keydown', onKey, true);
  }
  document.addEventListener('click', event => {
    const label = event.target.closest?.('.chat-line__username')?.querySelector(USER) || event.target.closest?.(USER);
    const name = username(label);
    if (name) { lastClick = { login: name, at: Date.now() }; scheduleScan(); }
  }, true);
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === 'npv:diagnostics') {
      const labels = chatLabels();
      respond({ version: api.runtime.getManifest().version, ready,
        chatMode: labels.some(label => label.matches('.seventv-chat-user-username')) ? '7TV' : 'Twitch',
        namesDetected: labels.length, popupDetected: Boolean(document.querySelector(POPUP)), lastError, lastLookup,
        saved: [...cache.values()].filter(entry => entry.reply.ok && entry.keep > Date.now()).length });
      return false;
    }
    if (message?.type === 'npv:clear-saved') {
      cache.clear(); ids.clear();
      for (const badge of document.querySelectorAll('.npv-showcase-badge')) badge.remove();
      scheduleScan();
      (api.storage?.local?.remove(SAVED) || Promise.resolve()).then(() => respond({ ok: true }), () => respond({ ok: false }));
      return true;
    }
    if (message?.type === 'npv:ready') {
      const becameReady = !ready;
      ready = true;
      if (becameReady) { for (const { panel } of panels.values()) panel.remove(); panels.clear(); }
      scheduleScan(); pump();
    }
  });
  loadSaved();
  api.runtime.sendMessage({ type: 'npv:status' }).then(status => {
    ready = Boolean(status?.ready); scheduleScan();
  }).catch(() => {});
  new MutationObserver(mutations).observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-a-user', 'href'] });
  document.addEventListener('scroll', event => {
    if (event.target === document || event.target?.matches?.('[data-a-target="chat-scroller"], .chat-scrollable-area__message-container, .seventv-chat-scroller') ||
        event.target?.querySelector?.(USER)) scheduleScan();
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { scheduleScan(); pump(); } });
  setInterval(() => { if (!document.hidden) { scheduleScan(); pump(); } }, 15000);
  scheduleScan();
})();
