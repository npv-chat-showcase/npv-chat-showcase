const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const read = name => fs.readFileSync(`extension/${name}`, 'utf8');
const version = JSON.parse(read('manifest.json')).version;
const settle = () => new Promise(resolve => setTimeout(resolve, 650));
const coreContext = vm.createContext({ URL });
vm.runInContext(read('core.js'), coreContext);
const core = coreContext.NpvShowcase;
const plain = data => JSON.parse(JSON.stringify(data));
const catalog = [{ id: 7, name: 'Blau', rarity: 'ultra', edition_images: {
  normal: 'https://nopixel-v-companion-cdn.com/cards/Blau.webp',
  gold: 'https://nopixel-v-companion-cdn.com/cards/Blau_Gold.webp'
} }];
const display = [{ id: 12, card_id: 7, edition: 'gold', print_number: 3178, created_at: '2026-09-11T15:30:00.000Z' }];
const cards = plain(core.cards(display, catalog));

test('joins displayed cards to catalog, preserves editions and print numbers', () => {
  assert.equal(cards[0].editionName, 'Gold');
  assert.equal(cards[0].printNumber, '3178');
  assert.equal(cards[0].ultraRare, true);
  assert.equal(cards[0].image, catalog[0].edition_images.gold);
  assert.deepEqual(plain(core.cards([], catalog)), []);
  assert.equal(core.cards([{ ...display[0], edition: 'legendary' }], catalog)[0].image, catalog[0].edition_images.normal);
});
test('whole displays are scored from print numbers and editions; legendary is out of reach for typical displays', () => {
  const card = (edition, printNumber, extra = {}) => ({ cardId: String(Math.random()), edition, printNumber: String(printNumber), ...extra });
  const rank = (...cards) => core.displayRank(cards).tier;
  assert.equal(core.cardPoints(card('normal', 10000)), 0);
  assert.equal(core.cardPoints(card('gold', 10000)), 2, 'Gold outranks Base at the same print');
  assert.equal(rank(card('gold', 1), card('normal', 918), card('normal', 6868)), 'epic', 'a Gold #1 carries the display');
  assert.equal(rank(card('normal', 1), card('normal', 5000), card('normal', 5000)), 'epic', 'any #1 is one of one');
  assert.equal(rank(card('gold', 1), card('normal', 93), card('legendary', 15)), 'legendary', 'a #1 backed by strong cards');
  assert.equal(rank(card('legendary', 1), card('legendary', 95), card('gold', 105)), 'legendary');
  assert.equal(rank(card('gold', 2), card('normal', 5000), card('normal', 5000)), 'epic');
  assert.equal(rank(card('gold', 5), card('normal', 5000), card('normal', 5000)), 'rare');
  assert.equal(rank(card('normal', 5000), card('normal', 6000), card('normal', 7000)), 'common');
  assert.equal(rank(card('legendary', 400), card('legendary', 400), card('legendary', 400)), 'rare');
  assert.equal(rank(card('gold', 130), card('gold', 130), card('gold', 130)), 'rare');
  assert.equal(rank(card('gold', 50), card('gold', 50), card('gold', 50)), 'epic');
  assert.equal(rank(card('gold', 5), card('gold', 67), card('legendary', 57)), 'epic', 'best logged display stays epic');
  assert.equal(rank(card('gold', 20), card('gold', 20), card('gold', 20)), 'epic');
  assert.equal(rank(card('gold', 9), card('gold', 11), card('gold', 33)), 'epic');
  assert.equal(rank(card('gold', 3), card('gold', 3), card('gold', 3)), 'legendary');
  const same = { cardId: '7' };
  const set = core.displayRank([card('normal', 50, same), card('normal', 50, same), card('normal', 50, same)]);
  assert.deepEqual([set.set, Math.round(set.score)], [true, Math.round(3 * Math.log2(200) + 4)], 'no low-print boost at #50');
  assert.equal(core.displayRank([]), null);
  assert.equal(cards[0].cardId, '7');
});
test('rejects invalid usernames and executable / unrelated image URLs', () => {
  assert.equal(core.login(' Kayklip '), 'kayklip');
  assert.equal(core.login('../inventory'), null);
  assert.equal(core.imageUrl('javascript:alert(1)'), null);
  assert.equal(core.imageUrl('https://example.com/card.png'), null);
  assert.throws(() => core.array({ error: 'unauthorized' }));
});
test('frame uses only read requests, caches lookups, never returns credentials', async () => {
  const calls = [];
  const handlers = new Map();
  const responses = [];
  const window = {
    Twitch: { ext: { viewer: { helixToken: 'test-helix-token', sessionToken: 'test-ebs-token' }, onAuthorized: () => { throw new Error('Must not replace the companion callback'); } } },
    addEventListener: (name, handler) => handlers.set(name, handler),
    dispatchEvent: event => {
      if (event.type === 'npv-showcase:response:v1') responses.push(JSON.parse(event.detail));
    }
  };
  const intervals = [];
  const context = vm.createContext({
    location: { pathname: '/release/video_overlay.html' }, window, NpvShowcase: core,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setInterval: callback => { intervals.push(callback); return intervals.length; }, clearInterval() {},
    setTimeout: callback => { callback(); }, AbortSignal, URL,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const payload = url.includes('/helix/') ? { data: [{ id: '123', display_name: 'Kayklip' }] }
        : url.endsWith('/cards') ? catalog : display;
      return { ok: true, status: 200, json: async () => payload };
    }
  });
  vm.runInContext(read('frame-api.js'), context);
  intervals[0]();
  const handler = handlers.get('npv-showcase:request:v1');
  handler({ detail: JSON.stringify({ id: 'first', login: 'kayklip' }) });
  await new Promise(resolve => setImmediate(resolve));
  handler({ detail: JSON.stringify({ id: 'second', login: 'kayklip' }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(responses.length, 2);
  assert.equal(responses[0].value.cards[0].editionName, 'Gold');
  assert.equal(calls.length, 3, 'second lookup must come from cache');
  assert.equal(responses[0].value.userId, '123', 'the page saves the ID for next time');
  handler({ detail: JSON.stringify({ id: 'third', login: 'someone_saved', userId: '456' }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 4, 'a saved user ID skips the Helix request');
  assert.match(calls[3].url, /display-cases\/456$/);
  assert(calls.every(call => call.options.method === 'GET' && call.options.credentials === 'omit'));
  assert(!JSON.stringify(responses).includes('test-ebs-token'));
  assert(!JSON.stringify(responses).includes('test-helix-token'));
});
function storage(initial = {}) {
  const stored = JSON.parse(JSON.stringify(initial));
  return { stored, local: {
    get: async key => JSON.parse(JSON.stringify(typeof key === 'string' ? { [key]: stored[key] } : key && typeof key === 'object' && !Array.isArray(key)
      ? Object.fromEntries(Object.entries(key).map(([name, fallback]) => [name, stored[name] ?? fallback])) : stored)),
    set: async value => { Object.assign(stored, JSON.parse(JSON.stringify(value))); },
    remove: async key => { delete stored[key]; }
  } };
}
// Run the extension's 10-second save debounce immediately.
const fastSave = window => {
  const later = window.setTimeout.bind(window);
  window.setTimeout = (callback, ms, ...rest) => later(callback, ms >= 10000 ? 0 : ms, ...rest);
};

test('saved displays show badges before the companion connects, then refresh with the saved user ID', async () => {
  const at = Date.now() - 3600000;
  const store = storage({ npvSaved: { v: 1, displays: { kayklip: { at, value: { login: 'kayklip', cards } } }, ids: { kayklip: ['123', at] } } });
  const lookups = [];
  const fresh = plain(core.cards([{ ...display[0], print_number: 1 }], catalog));
  const dom = await setup(message => { lookups.push(message); return { ok: true, value: { login: 'kayklip', userId: '123', cards: fresh } }; }, undefined, false, window => {
    window.chrome.storage = store; fastSave(window);
  });
  try {
    const { document } = dom.window;
    assert.equal(document.querySelectorAll('.npv-showcase-badge').length, 1, 'badge straight from the saved display');
    assert.deepEqual(lookups, []);
    dom.window.messageHandler({ type: 'npv:ready' });
    await settle();
    assert.deepEqual(lookups.map(message => [message.login, message.userId]), [['kayklip', '123']]);
    await settle();
    assert.equal(store.stored.npvSaved.displays.kayklip.value.cards[0].printNumber, '1', 'the refreshed display is saved');
    let status;
    dom.window.messageHandler({ type: 'npv:diagnostics' }, {}, value => { status = value; });
    assert.equal(status.saved, 1);
  } finally { dom.window.close(); }
});

test('a failed refresh keeps the saved badge; clearing removes saved displays', async () => {
  const at = Date.now() - 3600000;
  const store = storage({ npvSaved: { v: 1, displays: { kayklip: { at, value: { login: 'kayklip', cards } } }, ids: {} } });
  const dom = await setup({ ok: false, error: 'NoPixel lookup failed (500).' }, undefined, true, window => { window.chrome.storage = store; });
  try {
    const { document } = dom.window;
    await settle();
    assert.equal(document.querySelectorAll('.npv-showcase-badge').length, 1);
    let cleared;
    dom.window.messageHandler({ type: 'npv:clear-saved' }, {}, value => { cleared = value; });
    await settle();
    assert.deepEqual(plain(cleared), { ok: true });
    assert.equal(store.stored.npvSaved, undefined);
    assert.equal(document.querySelectorAll('.npv-showcase-badge').length, 0);
  } finally { dom.window.close(); }
});

test('service worker rejects lookups from unrelated pages and cross-tab frames', async () => {
  let listener, installed;
  const calls = [];
  const removed = [];
  const context = vm.createContext({ URL, chrome: {
    runtime: { onMessage: { addListener: handler => { listener = handler; } }, onInstalled: { addListener: handler => { installed = handler; } } },
    storage: { local: { remove: async keys => { removed.push(...keys); } } },
    tabs: {
      sendMessage: async (...args) => { calls.push(args); return { ok: true, value: { cards } }; },
      onRemoved: { addListener() {} }, onUpdated: { addListener() {} }
    }
  } });
  vm.runInContext(read('background.js'), context);
  installed();
  assert.deepEqual(removed, ['npvDebugLog', 'npvDebugCatalog'], 'updating removes the old test-build card log');
  const frame = { tab: { id: 4 }, frameId: 3, url: 'https://nstuq90nghenyqwqme61jgvmtp253a.ext-twitch.tv/release/video_overlay.html' };
  listener({ type: 'npv:frame-ready' }, frame, () => {});
  let response;
  listener({ type: 'npv:lookup', login: 'kayklip' }, { tab: { id: 5 }, frameId: 0, url: 'https://www.twitch.tv/deansocool' }, reply => { response = reply; });
  assert.equal(response.ok, false, 'another tab cannot reuse this overlay');
  const before = calls.length;
  listener({ type: 'npv:lookup', login: 'kayklip' }, { tab: { id: 4 }, frameId: 0, url: 'https://example.com/' }, () => {});
  assert.equal(calls.length, before);
  listener({ type: 'npv:lookup', login: 'kayklip' }, { tab: { id: 4 }, frameId: 0, url: 'https://www.twitch.tv/deansocool' }, reply => { response = reply; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(response.ok, true);
  assert.equal(calls.at(-1)[2].frameId, 3);
});

async function setup(reply, html, ready = true, configure = () => {}) {
  const dom = new JSDOM(html || `<!doctype html><body><div class="chat-line__username-container"><span class="chat-line__username" role="button"><span data-a-target="chat-message-username" data-a-user="kayklip">Kayklip</span></span></div></body>`, {
    url: 'https://www.twitch.tv/deansocool', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const { window } = dom;
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 1, bottom: 20, left: 1, width: 100, height: 20 });
  window.chrome = { runtime: {
    getManifest: () => ({ version }),
    onMessage: { addListener(handler) { window.messageHandler = handler; } },
    sendMessage: async message => message.type === 'npv:status' ? { ready } : typeof reply === 'function' ? reply(message) : reply
  } };
  configure(window);
  window.eval(read('core.js'));
  window.eval(read('chat.js'));
  await settle();
  return dom;
}
test('badges appear only for nonempty displays and cards join the viewer popup', async () => {
  const dom = await setup({ ok: true, value: { login: 'kayklip', cards } });
  try {
    const { document, MouseEvent } = dom.window;
    assert.equal(document.querySelectorAll('.npv-showcase-badge').length, 1);
    assert.equal(document.querySelector('.npv-showcase-badge').dataset.tier, 'common', 'one Gold #3178 is a common display');
    document.querySelector('.chat-line__username').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const popup = document.createElement('div');
    popup.className = 'viewer-card';
    popup.innerHTML = '<a href="/kayklip">Kayklip</a><h3>Badges</h3>';
    document.body.append(popup);
    await settle();
    assert.equal(popup.querySelectorAll('.npv-showcase-card').length, 1);
    assert.equal(popup.querySelector('.npv-showcase-print').textContent, '3178');
    assert.equal(popup.querySelector('img').src, catalog[0].edition_images.gold);
    popup.querySelector('.npv-showcase-art').click();
    assert(document.querySelector('.npv-showcase-preview'));
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(document.querySelector('.npv-showcase-preview'), null);
  } finally { dom.window.close(); }
});
test('empty displays do not award a badge', async () => {
  const dom = await setup({ ok: true, value: { login: 'kayklip', cards: [] } });
  try { assert.equal(dom.window.document.querySelectorAll('.npv-showcase-badge').length, 0); }
  finally { dom.window.close(); }
});
test('errors do not masquerade as users without cards', async () => {
  const dom = await setup({ ok: false, error: 'NoPixel unavailable' });
  try {
    const popup = dom.window.document.createElement('div');
    popup.className = 'viewer-card';
    popup.innerHTML = '<a href="/kayklip">Kayklip</a>';
    dom.window.document.body.append(popup);
    await settle();
    assert.equal(popup.querySelector('.npv-showcase-message').textContent, 'NoPixel unavailable');
    assert(popup.querySelector('.npv-showcase-retry'));
    assert.equal(dom.window.document.querySelector('.npv-showcase-badge'), null);
  } finally { dom.window.close(); }
});

const sevenChat = `<div class="seventv-user-message"><div class="seventv-chat-user"><span class="seventv-chat-user-badge-list">★</span><span class="seventv-chat-user-username"><span><span>Кайклип</span><span> (Kayklip)</span></span></span></div>: hello</div>`;
const sevenPopup = `<div class="seventv-user-card-header"><div class="seventv-user-card-identity"><a class="seventv-user-card-usertag" href="https://www.twitch.tv/kayklip"><div class="seventv-chat-user"><span class="seventv-chat-user-username">Kayklip</span></div></a></div></div><div class="seventv-user-card-data"><span data-a-user="someone_else">Another chatter from history</span><a href="/someone_else">History</a></div>`;

test('7TV names, badge clicks and popup identity work with international display names', async () => {
  const lookups = [];
  const dom = await setup(message => {
    lookups.push(message.login);
    return { ok: true, value: { login: message.login, cards } };
  }, `<!doctype html><body>${sevenChat}</body>`);
  try {
    const { document } = dom.window;
    const label = document.querySelector('.seventv-chat-user-username');
    label.addEventListener('click', () => {
      const popup = document.createElement('div'); popup.className = 'seventv-user-card';
      popup.innerHTML = sevenPopup; document.body.append(popup);
    });
    assert.equal(document.querySelectorAll('.npv-showcase-badge').length, 1);
    document.querySelector('.npv-showcase-badge').click();
    await settle();
    const popup = document.querySelector('.seventv-user-card');
    assert.equal(popup.className, 'seventv-user-card', 'leave the parent grid untouched');
    assert.equal(popup.querySelectorAll('.npv-showcase-card').length, 1);
    assert.equal(popup.querySelector('.npv-showcase-panel').parentElement, popup.querySelector('.seventv-user-card-header'));
    assert(popup.querySelector('.npv-showcase-panel').classList.contains('npv-showcase-in-7tv'));
    assert.equal(popup.querySelector('.npv-showcase-badge'), null, 'do not decorate header or message history');
    assert.deepEqual(lookups, ['kayklip'], 'ignore history users');
    let status;
    dom.window.messageHandler({ type: 'npv:diagnostics' }, {}, value => { status = value; });
    assert.equal(status.chatMode, '7TV'); assert.equal(status.namesDetected, 1);
    assert.equal(status.lastLookup, 'kayklip'); assert.equal(status.ready, true);

    // 7TV can reuse the same popup when the selected person changes.
    popup.querySelector('.seventv-user-card-usertag').href = '/example_empty';
    await new Promise(resolve => setTimeout(resolve, 1400));
    assert.deepEqual(lookups, ['kayklip', 'example_empty']);
    assert.equal(popup.querySelectorAll('.npv-showcase-panel').length, 1);
  } finally { dom.window.close(); }
});

test('a visible 7TV message is checked even when an earlier duplicate is offscreen', async () => {
  const dom = await setup({ ok: true, value: { cards } }, `<!doctype html><body>${sevenChat}${sevenChat}</body>`, false);
  try {
    const labels = dom.window.document.querySelectorAll('.seventv-chat-user-username');
    labels[0].getBoundingClientRect = () => ({ top: -100, bottom: -80, width: 100, height: 20 });
    dom.window.messageHandler({ type: 'npv:ready' });
    await settle();
    assert.equal(dom.window.document.querySelectorAll('.npv-showcase-badge').length, 2);
  } finally { dom.window.close(); }
});

test('every open 7TV user card gets its own panel, with pull dates under the cards', async () => {
  const lookups = [];
  const other = sevenPopup.replaceAll('kayklip', 'example_empty').replace('>Kayklip<', '>Example_Empty<');
  const dom = await setup(message => { lookups.push(message.login); return { ok: true, value: { login: message.login, cards } }; },
    `<!doctype html><body><div class="seventv-user-card" id="a">${sevenPopup}</div><div class="seventv-user-card" id="b">${other}</div></body>`);
  try {
    const { document } = dom.window;
    await settle(); await settle();
    assert.deepEqual(lookups.sort(), ['example_empty', 'kayklip']);
    for (const id of ['a', 'b']) {
      const popup = document.getElementById(id);
      assert.equal(popup.querySelectorAll('.npv-showcase-panel').length, 1, `panel in card ${id}`);
      assert.match(popup.querySelector('.npv-showcase-pulled').textContent, /^Pulled /);
      assert.match(popup.querySelector('.npv-showcase-pulled').title, /2026/);
    }
    assert.equal(core.cards([{ ...display[0], created_at: 'not a date' }], catalog)[0].pulledAt, null);
  } finally { dom.window.close(); }
});

test('7TV popup explains waiting for companion then recovers when it becomes ready', async () => {
  const dom = await setup({ ok: true, value: { cards } }, `<!doctype html><body><div class="seventv-user-card">${sevenPopup}</div></body>`, false);
  try {
    const popup = dom.window.document.querySelector('.seventv-user-card');
    assert.match(popup.querySelector('.npv-showcase-message').textContent, /companion overlay/);
    dom.window.messageHandler({ type: 'npv:ready' });
    await settle();
    assert.equal(popup.querySelectorAll('.npv-showcase-card').length, 1);
  } finally { dom.window.close(); }
});

test('7TV panel drags the card from its handle without enlarging a card after a drag', async () => {
  const dom = await setup({ ok: true, value: { cards } }, `<!doctype html><body><div class="seventv-user-card">${sevenPopup}</div></body>`, true, window => {
    // jsdom has no PointerEvent.
    window.PointerEvent = class extends window.MouseEvent {
      constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId; this.pointerType = init.pointerType; }
    };
  });
  try {
    const { document, PointerEvent, MouseEvent } = dom.window;
    const popup = document.querySelector('.seventv-user-card');
    const handled = [];
    popup.querySelector('.seventv-user-card-identity').addEventListener('pointerdown', event => handled.push(event));
    const art = popup.querySelector('.npv-showcase-art');
    assert.equal(art.querySelector('img').draggable, false, 'native image drag would steal the pointer');

    const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10, pointerType: 'mouse' });
    art.dispatchEvent(down);
    assert.equal(down.defaultPrevented, true);
    assert.equal(handled.length, 1);
    assert.deepEqual([handled[0].clientX, handled[0].clientY, handled[0].pointerType], [10, 10, 'mouse']);
    art.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 80, clientY: 60 }));
    assert.equal(document.querySelector('.npv-showcase-preview'), null);

    art.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 }));
    art.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12, clientY: 11 }));
    assert(document.querySelector('.npv-showcase-preview'), 'a click still enlarges the card');
  } finally { dom.window.close(); }
});

test('toolbar status shows connection details and reports a missing page script', async () => {
  const dom = new JSDOM(read('status.html'), { runScripts: 'outside-only' });
  try {
    const { window } = dom;
    let disconnected = false;
    window.chrome = {
      runtime: { getManifest: () => ({ version }) },
      tabs: { query: async () => [{ id: 4 }], sendMessage: async (tab, message, options) => {
        assert.equal(tab, 4); assert.equal(options.frameId, 0);
        assert.equal(message.type, 'npv:diagnostics');
        if (disconnected) throw new Error('No receiving end');
        return { version, ready: true, chatMode: '7TV', namesDetected: 12, lastLookup: 'kayklip', lastError: 'NoPixel lookup failed (403).' };
      } }
    };
    window.eval(read('status.js'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(window.document.querySelector('#summary').textContent, 'NoPixel lookup failed (403).');
    assert.match(window.document.querySelector('#details').textContent, /7TV/);
    disconnected = true; window.document.querySelector('#refresh').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.match(window.document.querySelector('#summary').textContent, /page script is not connected/);
  } finally { dom.window.close(); }
});

test('large cached chat uses one traversal per update and ignores its own badge mutations', async () => {
  let calls = 0;
  let traversals = 0;
  const baseTime = Date.now();
  const messages = Array.from({ length: 50 }, (_, i) => `<div class="seventv-user-message"><span class="seventv-chat-user-username">viewer_${i}</span>: hello</div>`).join('');
  const dom = await setup(() => {
    calls++;
    return { ok: true, value: { cards } };
  }, `<!doctype html><body><div id="chat">${messages}</div><div id="other"></div></body>`, true, window => {
    // Advance lookup time without spending 50 seconds on the network queue.
    window.Date.now = () => baseTime + calls * 1000;
    const query = window.document.querySelectorAll.bind(window.document);
    window.document.querySelectorAll = selector => {
      if (selector.includes('chat-message-username')) traversals++;
      return query(selector);
    };
  });
  try {
    const { document } = dom.window;
    assert.equal(calls, 50);
    assert.equal(document.querySelectorAll('.npv-showcase-badge').length, 50);
    const initial = traversals;
    await settle();
    assert.equal(traversals, initial, 'our own DOM changes must not retrigger scans');
    document.getElementById('chat').insertAdjacentHTML('beforeend', messages.repeat(10));
    await settle();
    assert.equal(document.querySelectorAll('.npv-showcase-badge').length, 550);
    assert.equal(calls, 50, 'reuse cached users');
    assert.equal(traversals - initial, 1, 'one traversal, not one traversal per cached user');
    const after = traversals;
    for (let i = 0; i < 100; i++) document.getElementById('other').append(document.createElement('span'));
    await settle();
    assert.equal(traversals, after, 'unrelated page updates should not scan chat');
  } finally { dom.window.close(); }
});
