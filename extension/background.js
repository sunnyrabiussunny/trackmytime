let tickInterval = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_TICK') {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(() => {
      chrome.action.setBadgeText({ text: msg.elapsed || '' });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    }, 1000);
  }
  if (msg.type === 'STOP_TICK') {
    if (tickInterval) clearInterval(tickInterval);
    chrome.action.setBadgeText({ text: '' });
  }
});
