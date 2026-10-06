# Chrome Web Store listing — NpV Chat Showcase 1.1.0

Copy each section into the matching field of the developer dashboard. Upload `dist/npv-chat-showcase-1.1.0.zip` (build it with `npm run package`).

## Store listing tab

**Name** (from the manifest): NpV Chat Showcase

**Summary** (from the manifest, 102/132 characters):
Tier badges in Twitch chat for NoPixel V Companion card display cases, plus the cards in viewer cards.

**Category:** Entertainment (alternative: Social Networking)

**Language:** English (United States)

**Description:**

```
See who's holding NoPixel cards, right in Twitch chat.

NpV Chat Showcase reads the public NoPixel V Companion display case of people chatting on a NoPixel stream and adds a small tier badge before their name. Click a name to see their displayed cards, with art, edition and print number, inside the viewer card. Click a card to enlarge it.

HOW TIERS WORK
Print numbers count copies in pull order, so low numbers are scarce. Every card scores by its print number and edition (Gold, Foil, Base). The lowest prints (#1–#3) get an extra boost, and three copies of the same card add a bonus. The three cards together decide the display's tier:
• Common: most displays
• Rare: about 1 in 5
• Epic: about 1 in 16
• Legendary: about 1 in 160

FEATURES
• Works with Twitch's own chat and with 7TV
• Badges for people you've seen before load instantly (saved on your computer for 24 hours)
• Display case shown in the viewer card, with the date each card was pulled
• Toolbar popup shows connection status and lets you clear saved badges

REQUIREMENTS
Open a live NoPixel stream that has the NoPixel V Companion video overlay enabled. The extension uses that overlay's existing session in the same tab. There is no separate login.

PRIVACY
No account, no tracking, no analytics. Saved badges stay in your browser. Nothing is sent to the developer.

This is an unofficial fan-made extension. It is not affiliated with, endorsed by, or sponsored by NoPixel or Twitch. Print numbers are not leaderboard points.
```

**Graphics:**
- Store icon: `extension/icons/icon-128.png`
- Screenshots (1280×800): `store/screenshot-chat.png`, `store/screenshot-tiers.png`
- Small promo tile (440×280): `store/promo-small-440x280.png`

**Official URL / homepage:** none required. **Support URL:** optional (e.g. a GitHub issues page or contact email).

**Mature content:** No.

## Privacy practices tab

**Single purpose:**

```
Shows the NoPixel V Companion card display cases of Twitch chatters as tier badges in Twitch chat and as card previews in Twitch / 7TV viewer cards.
```

**Permission justifications:**

`storage`:
```
Saves looked-up display cases (Twitch login, displayed card names, editions and print numbers) and Twitch user IDs on the user's own computer so badges for people seen before appear instantly and repeat lookups need fewer requests. Saved displays expire after 24 hours and user IDs after 30 days; the toolbar popup can clear them.
```

Host permission `https://www.twitch.tv/*` (content script):
```
Reads chat usernames and the open viewer card on Twitch pages to place tier badges before names and to show the person's displayed cards in the viewer card.
```

Host permission `https://nstuq90nghenyqwqme61jgvmtp253a.ext-twitch.tv/*` (content scripts):
```
This is the origin of the NoPixel V Companion Twitch extension overlay. A script inside that overlay frame uses the overlay's existing session to request public display cases (GET /cards/display-cases/{userId} and GET /cards from NoPixel's companion API, and GET /helix/users from Twitch to turn a login into a user ID). Only card data is passed back to the Twitch page; the session tokens never leave the overlay frame and are not stored.
```

**Remote code:** No, I am not using remote code. (All JavaScript ships in the package. The extension only fetches JSON data and card images.)

**Data usage** — tick:
- **Website content**: chat usernames on Twitch pages are read to look up display cases. Display-case results are stored locally only.

Leave unticked: personally identifiable information, health, financial and payment, authentication information (the overlay's session is used only inside its own frame to make the same requests the companion makes; it is never collected, stored, or sent to the developer), personal communications (message text is not read), location, web history, user activity.

Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** host `store/PRIVACY.md` publicly (GitHub Pages, a public GitHub file, a Google Doc shared as "anyone with the link", or Google Sites) and paste the link here.

## Distribution tab

- **Visibility:** Public, or Unlisted (only people with the link can install).
- **Regions:** All regions.
- **Pricing:** Free.

## Before you submit

- Fill in the contact line in `PRIVACY.md`, host it, and paste its link in the Privacy tab.
- Review risk: the extension uses NoPixel's undocumented companion API through the overlay's session. Asking NoPixel for permission first (and mentioning it in the "Notes for the reviewer" field if they agree) lowers the chance of rejection or a later takedown.
- Test the packaged build: unzip `dist/npv-chat-showcase-1.1.0.zip`, load it with **Load unpacked**, and check a live NoPixel stream with Twitch chat and with 7TV.

# Firefox Add-ons (addons.mozilla.org)

Upload `dist/npv-chat-showcase-firefox-1.1.0.zip` at https://addons.mozilla.org/developers/ → **Submit a New Add-on** → **On this site**. It passes `web-ext lint` with no errors or warnings. It needs Firefox 140 or newer (Firefox for Android 142).

- **Source code:** answer **No**. The package is the plain, unminified source, so Mozilla doesn't need a separate source upload.
- **Name, summary, description:** reuse the Chrome texts above. The summary field allows up to 250 characters.
- **Categories:** Social & Communication, or Games & Entertainment.
- **License:** MIT License.
- **Privacy policy:** paste the text of `store/PRIVACY.md` (Firefox has a text box, not a link field).
- **Support site:** https://github.com/npv-chat-showcase/npv-chat-showcase/issues
- **Data collection:** the manifest declares `websiteContent` as required, because Twitch usernames shown on the page are sent to NoPixel's companion API and Twitch to look up display cases. Firefox shows this at install.
- **Notes to reviewer:** paste the Chrome "Test instructions" text.
- **Screenshots:** the same `store/screenshot-*.png` files.

Firefox reviews new add-ons too; updates get an automatic check and sometimes a manual review.
