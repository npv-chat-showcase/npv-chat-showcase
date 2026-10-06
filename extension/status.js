(() => {
  // Firefox provides the promise-based `browser` namespace; Chrome provides `chrome` (and `browser` in newer versions).
  const api = globalThis.browser ?? globalThis.chrome;
  const summary = document.getElementById('summary');
  const details = document.getElementById('details');
  const hint = document.getElementById('hint');
  document.getElementById('version').textContent = `Version ${api.runtime.getManifest().version}`;
  async function check() {
    summary.textContent = 'Checking this tab…';
    details.replaceChildren(); hint.textContent = '';
    try {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');
      const status = await api.tabs.sendMessage(tab.id, { type: 'npv:diagnostics' }, { frameId: 0 });
      if (!status) throw new Error('No content script');
      summary.textContent = status.lastError || (status.ready ? 'Connected to the NoPixel companion.' : 'Waiting for the NoPixel companion.');
      for (const [label, value] of [
        ['Page script', status.version], ['Chat', status.chatMode], ['Chat names found', status.namesDetected],
        ['Companion', status.ready ? 'Connected' : 'Waiting'], ['Latest checked user', status.lastLookup || 'None yet'],
        ['Saved displays', status.saved ?? 0]
      ]) {
        const dt = document.createElement('dt'); dt.textContent = label;
        const dd = document.createElement('dd'); dd.textContent = String(value);
        details.append(dt, dd);
      }
      hint.textContent = status.ready ? 'Click a chat name to check that viewer first. Badges appear gradually.'
        : 'Keep a live NoPixel stream open in this tab with the companion overlay enabled. After updating the extension, refresh Twitch.';
    } catch {
      summary.textContent = 'The Twitch page script is not connected.';
      hint.textContent = 'Open a www.twitch.tv stream and refresh it. If you just updated the extension, reload it in chrome://extensions first.';
    }
  }
  document.getElementById('refresh').addEventListener('click', check);
  document.getElementById('clear-saved').addEventListener('click', async () => {
    try {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      await api.tabs.sendMessage(tab.id, { type: 'npv:clear-saved' }, { frameId: 0 });
    } catch {}
    check();
  });
  check();
})();
