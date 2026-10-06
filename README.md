# NpV Chat Showcase

Chrome extension that adds a tier badge just before Twitch chat usernames **after confirming they have NoPixel V Companion cards on display**, and shows the displayed cards in the viewer card. Supports Twitch's standard chat and 7TV's replacement chat and user popup. Up to three cards show their art, edition, print number, and the date that copy was pulled. Click a card to enlarge it. Every open 7TV user card gets its own panel.

Unofficial; not affiliated with NoPixel or Twitch.

**Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/npv-chat-showcase/hakjccphjlggkhecdloianchdljgpjok). Firefox 140+: download `npv-chat-showcase-firefox-<version>.zip` from [Releases](https://github.com/npv-chat-showcase/npv-chat-showcase/releases) until the Firefox Add-ons listing is live.

## Safety

The whole extension is the `extension/` folder: about 800 lines of plain JavaScript, CSS and HTML, with no build step, no minification, and no remote code.

- **Permissions:** `storage` (the local badge cache) and two sites: `www.twitch.tv` (chat badges and viewer cards) and the NoPixel V Companion overlay frame (`nstuq90nghenyqwqme61jgvmtp253a.ext-twitch.tv`), where it asks NoPixel for public display cases using the overlay's existing session.
- **Network:** only requests NoPixel's companion API, Twitch's user lookup, and card images from NoPixel's CDN. There is no analytics and no server run by this project.
- **Credentials:** the overlay's session tokens never leave the overlay frame; only card data reaches the Twitch page. `tests/` checks this.
- **Data:** saved badges stay in your browser's extension storage and can be cleared from the toolbar popup. See [store/PRIVACY.md](store/PRIVACY.md).

**Check the store build against this code:** install from the store, then open Chrome's extension folder (Windows: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\hakjccphjlggkhecdloianchdljgpjok\<version>`; macOS: `~/Library/Application Support/Google/Chrome/Default/Extensions/hakjccphjlggkhecdloianchdljgpjok/<version>`). Apart from the `_metadata` folder the store adds, its files match `extension/` at the tag for that version.

## Install locally

Firefox: run `npm run package`, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and pick `dist/npv-chat-showcase-firefox-<version>.zip`. Temporary add-ons are removed when Firefox closes. If badges don't appear, open `about:addons` → NpV Chat Showcase → **Permissions** and allow the Twitch sites.

Chrome:

1. Open `chrome://extensions` in Chrome and enable Developer mode.
2. Click **Load unpacked** and select the `extension` folder in this workspace.
3. Refresh a live NoPixel Twitch stream that has the **NoPixel V Companion** video overlay enabled.
4. Wait for the overlay to load. Badges populate gradually as visible chatters are checked. Click a chat name to prioritize that viewer's lookup.

After updating the files, click the extension's **Reload** button in `chrome://extensions`, refresh Twitch, and confirm the version in the toolbar popup.

## Display tiers

The chat badge is a capsule placed just before the username, shaped differently from Twitch and 7TV's square badges, showing two fanned cards. The front card's emblem also marks the tier: lines (Common), diamond (Rare), sparkle (Epic), star with a soft glow (Legendary). `preview/badges.html` shows all four.

The chat badge and the viewer-card panel rate the **whole display case**. Print numbers count copies of each card per edition in pull order (October 2026: about 8,700 Base, 480 Foil and 140 Gold copies per card), so print #p is one of only p such copies. Each card earns `log2(10000 / print)` points (minimum 0), plus 2 for Gold, 1 for Foil and 4 for the ultra card. Very low prints are then multiplied by `1 + 1.5 × 0.5^(print − 1)`: #1 ×2.5, #2 ×1.75, #3 ×1.38, fading out by #10, so a one-of-one card can carry a display on its own. The display score is the sum of its cards, plus 4 for three copies of the same card.

| Tier | Color | Display score | Logged displays (320) |
| --- | --- | --- | --- |
| Legendary | orange | 45+ (a #1 print backed by strong cards, or three Golds around #3) | ~0.6% |
| Epic | purple | 26+ (e.g. any #1 or Gold #2 alone, or three Golds around #50) | ~6% |
| Rare | blue | 16+ (e.g. three Foils, or a Gold #5) | ~19% |
| Common | gray | below 16 | ~74% |

Thresholds live in `displayRank()` in `extension/core.js`.

## Saved badges

Lookups are saved in the extension's local storage, so badges for people you have seen before appear instantly, even before the NoPixel companion connects or after a refresh. Saved displays are kept for 24 hours (newest 3,000 viewers) and refreshed in the background after 15 minutes. New chatters are looked up before saved ones are refreshed, and an open viewer card is looked up before both. A failed refresh keeps the saved badge. Twitch user IDs are remembered for 30 days so repeat lookups skip the Twitch user request. The data stays in this browser; the toolbar popup shows how many displays are saved and has **Clear saved badges**.

Updating from a 0.1.4–0.2.0 test build deletes the temporary card log those builds kept.

## Troubleshooting

Click **NpV Chat Showcase** in Chrome's extensions menu. Its status popup shows the version, whether the page script loaded, which chat is detected, whether the companion connected, how many displays are saved, and the latest lookup error. A waiting companion message means no authenticated NoPixel overlay has connected yet. A connected companion with an API error shows that error directly.

## Data and behavior

- Uses the same `GET /cards/display-cases/{userId}` and `GET /cards` routes as NoPixel's currently published companion (version 1.1.3, inspected October 5, 2026).
- Resolves usernames through the Twitch Helix users endpoint using the existing companion's extension session. The token stays inside the companion iframe and is sent only to its existing authorized Twitch / NoPixel destinations. It is not persisted, logged, or sent to the chat page or service worker.
- Needs the existing NoPixel overlay in the **same tab** for new lookups. There is no standalone login or automatic identity-sharing prompt. Saved badges still show without it.
- Looks up at most one username per second. A badge confirms a nonempty display case; lack of a badge can also mean a lookup is still pending or unavailable.
- Retrieves displayed cards only. It does not read anyone's private inventory, change showcases, open packs, or post chat messages. It does not infer total leaderboard scores.
- Print numbers such as `3178` are **not points**. Full leaderboard score cannot be calculated from three showcased cards.
- This is an unofficial integration with an undocumented endpoint. NoPixel / Twitch changes may require updates. The currently known card-art CDN is allowlisted.

## Publishing

`npm run package` runs the tests, checks that every file the manifest references exists, and writes two ZIPs with `manifest.json` at the root: `dist/npv-chat-showcase-<version>.zip` for the Chrome Web Store and `dist/npv-chat-showcase-firefox-<version>.zip` for Firefox Add-ons. Both contain the same files; the Firefox manifest swaps the background service worker for a background script and adds the Firefox add-on ID, minimum version, and data-collection declaration. Check the Firefox build with `npx web-ext lint --source-dir <unzipped folder>`.

`store/` holds the listing text, permission justifications and privacy answers (`LISTING.md`), the privacy policy to host at a public URL (`PRIVACY.md`), two 1280×800 screenshots and a 440×280 promo tile. The screenshots and tile are captures of `preview/store.html` (`?view=chat`, `?view=tiers`, `?view=promo`) with made-up chatter names. `python scripts/icons.py` redraws the extension icons in `extension/icons/`.

Bump `version` in `extension/manifest.json` for every upload; the store rejects a version it has already seen.

## License

MIT, see [LICENSE](LICENSE).

## Development

Run `npm ci` and `npm test`. Tests cover card metadata joining, empty displays, session failure, caching, saved badges, credential containment, tab isolation, display tiers, badge rendering, viewer-card insertion, card enlargement, and 7TV card dragging. The performance regression test checks 550 chat messages, one traversal per update, and no scans caused by the extension's own DOM writes or unrelated page changes.

To open the UI fixtures, run `python -m http.server 8765 --bind 127.0.0.1` from this directory, then visit `http://127.0.0.1:8765/preview/` (chat and viewer card, including a 7TV mode) or `preview/badges.html` (all badge tiers). They use sample data and the same rendering code as the extension. They are not live integration tests.

Chrome documentation: [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
