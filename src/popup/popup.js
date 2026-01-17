document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('toggle-btn');
  btn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        console.error('No active tab found');
        return;
      }

      if (tab.url.includes('gemini.google.com')) {
        chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_PANEL' }, (response) => {
          if (chrome.runtime.lastError) {
            alert('Please refresh the Gemini page to load the exporter.');
          }
          // window.close(); // Optional: close popup immediately
        });
      } else {
        alert('Please navigate to gemini.google.com to use this extension.');
      }
    } catch (err) {
      console.error('Error toggling panel:', err);
    }
  });
});
