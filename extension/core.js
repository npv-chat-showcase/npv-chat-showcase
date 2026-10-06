/* Shared validation and rendering data. No tokens or user inventory are exported. */
(() => {
  const editions = { normal: "Base", legendary: "Foil", gold: "Gold" };
  function login(value) {
    if (typeof value !== "string") return null;
    const result = value.trim().toLowerCase();
    return /^[a-z0-9_]{1,25}$/.test(result) ? result : null;
  }
  function imageUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "nopixel-v-companion-cdn.com"
        ? url.href : null;
    } catch { return null; }
  }
  function array(body) {
    const result = Array.isArray(body) ? body : body?.data;
    if (!Array.isArray(result)) throw new Error("NoPixel returned an unfamiliar card format.");
    return result;
  }
  function cards(display, catalog) {
    const byId = new Map(array(catalog).map(card => [String(card.id), card]));
    return array(display).slice(0, 3).map(card => {
      const base = byId.get(String(card.card_id));
      const edition = Object.hasOwn(editions, card.edition) ? card.edition : "normal";
      return {
        id: String(card.id),
        cardId: String(card.card_id ?? ""),
        name: typeof base?.name === "string" ? base.name.slice(0, 100) : "NoPixel card",
        edition,
        editionName: editions[edition],
        printNumber: String(card.print_number ?? "").slice(0, 20),
        image: imageUrl(base?.edition_images?.[edition] || base?.edition_images?.normal),
        ultraRare: base?.rarity === "ultra",
        // When this copy was pulled; print numbers rise with it.
        pulledAt: typeof card.created_at === "string" && !Number.isNaN(Date.parse(card.created_at)) ? card.created_at.slice(0, 40) : null
      };
    });
  }
  // Print numbers count copies per card and edition in pull order (Oct 2026: about 8,700 Base,
  // 480 Foil and 140 Gold per card), so print #p is one of only p such copies. A card earns one
  // point per halving of that count below 10,000, plus an edition bonus; the ultra card is ~20x scarcer.
  const editionBonus = { normal: 0, legendary: 1, gold: 2 };
  // Thresholds from 320 logged displays: Legendary ~0.6% (a #1 print backed by strong cards,
  // or three Golds around #3), Epic ~6%, Rare ~19%.
  const tiers = [["legendary", 45], ["epic", 26], ["rare", 16], ["common", 0]];
  function cardPoints(card) {
    const print = Math.max(1, Number(card?.printNumber) || 10000);
    const points = Math.max(0, Math.log2(10000 / print)) + (editionBonus[card?.edition] || 0) + (card?.ultraRare ? 4 : 0);
    // One-of-one prints stand out on their own: #1 x2.5, #2 x1.75, #3 x1.38, fading out by #10.
    return points * (1 + 1.5 * 0.5 ** (print - 1));
  }
  function displayRank(cards) {
    if (!cards?.length) return null;
    const shown = cards.slice(0, 3);
    const set = shown.length === 3 && Boolean(shown[0].cardId) && shown.every(card => card.cardId === shown[0].cardId);
    const score = shown.reduce((sum, card) => sum + cardPoints(card), 0) + (set ? 4 : 0);
    return { tier: tiers.find(([, min]) => score >= min)[0], score, set };
  }
  globalThis.NpvShowcase = Object.freeze({ login, imageUrl, array, cards, editions, cardPoints, displayRank });
})();
