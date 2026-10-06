# NpV Chat Showcase — Privacy Policy

Last updated: October 5, 2026

NpV Chat Showcase ("the extension") is an unofficial Chrome extension that shows NoPixel V Companion card display cases of Twitch chatters as badges in Twitch chat and in viewer cards. It is not affiliated with NoPixel or Twitch.

## What the extension reads

- **Chat usernames and the open viewer card** on `www.twitch.tv` pages, to know whose display case to look up and where to show it. The extension does not read the text of chat messages.
- **Public display cases** from the NoPixel V Companion service: the names, editions and print numbers of the up to three cards a person has chosen to display, plus the public card catalog.
- **Twitch user IDs** for those usernames, from Twitch's public user endpoint.

These requests are made from inside the NoPixel V Companion overlay that is already running on the stream page, using that overlay's existing session — the same kind of requests the overlay itself makes. The session tokens stay inside the overlay frame. The extension does not store them, log them, or send them anywhere else.

## What the extension stores

On your own computer only, in Chrome's extension storage:

- Looked-up display cases (Twitch login, display name, card names, editions, print numbers and card image links), kept for up to 24 hours and for at most 3,000 people.
- Twitch login → user ID pairs, kept for up to 30 days.

You can delete this data at any time with **Clear saved badges** in the extension's toolbar popup, or by removing the extension.

## What the extension does not do

- It does not send any data to the developer or to any server other than Twitch and the NoPixel V Companion service, and only to request the display cases described above.
- It has no accounts, analytics, tracking, advertising or crash reporting.
- It does not sell, share or transfer data to third parties, and it does not use data for any purpose other than showing display-case badges and cards.
- It does not read private inventories, open packs, change display cases, or post in chat.

## Third parties

Display cases and card images come from the NoPixel V Companion service and its image CDN, and user IDs come from Twitch. Their own privacy policies apply to those services.

## Changes

If this policy changes, the updated version will be published at the same address with a new "Last updated" date.

## Contact

Questions or problems: open an issue at https://github.com/npv-chat-showcase/npv-chat-showcase/issues
