// Background service worker
try {
    importScripts('../../src/lib/jszip.min.js');
} catch (e) {
    console.error("Failed to load JSZip:", e);
}

console.log('Gemini Export: Service Worker Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_EXPORT') {
        handleExport(request.formats, request.tabId);
    }
});

async function handleExport(formats, sourceTabId) {
    try {
        console.log('Starting export...');

        // 1. Get List of Chats from the *current* tab (the one the user is looking at)
        const listResponse = await chrome.tabs.sendMessage(sourceTabId, { action: 'GET_CHAT_LIST' });

        if (!listResponse || !listResponse.chatList || listResponse.chatList.length === 0) {
            throw new Error('No chats found. Please scroll down the sidebar to load more chats, then try again.');
        }

        const { chatList } = listResponse;
        console.log(`Found ${chatList.length} chats to export.`);

        const zip = new JSZip();
        let processedCount = 0;

        // 2. Iterate and scrape
        // We create a new tab for scraping
        const scraperTab = await chrome.tabs.create({ active: false, url: 'about:blank' });
        const scraperTabId = scraperTab.id;

        for (const chat of chatList) {
            // Update user
            chrome.runtime.sendMessage({
                type: 'EXPORT_PROGRESS',
                payload: { current: processedCount, total: chatList.length, status: `Scraping: ${chat.title}` }
            });

            // Skip if invalid URL
            if (!chat.url.startsWith('http')) continue;

            const content = await scrapeChat(scraperTabId, chat.url);

            // Format
            const safeTitle = (chat.title || 'Untitled').replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_').substring(0, 50); // specific support for chinese chars
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

            if (formats.includes('json')) {
                zip.file(`${safeTitle}.json`, JSON.stringify(content, null, 2));
            }
            if (formats.includes('md')) {
                zip.file(`${safeTitle}.md`, convertToMarkdown(content, chat));
            }

            processedCount++;
        }

        // Cleanup
        chrome.tabs.remove(scraperTabId);

        // 3. Generate Zip
        chrome.runtime.sendMessage({
            type: 'EXPORT_PROGRESS',
            payload: { current: processedCount, total: chatList.length, status: 'Compressing files...' }
        });

        const blobBase64 = await zip.generateAsync({ type: 'base64' });
        const dataUrl = 'data:application/zip;base64,' + blobBase64;

        // 4. Download
        await chrome.downloads.download({
            url: dataUrl,
            filename: 'gemini_export.zip',
            saveAs: true
        });

        chrome.runtime.sendMessage({ type: 'EXPORT_COMPLETE' });

    } catch (error) {
        console.error('Export failed:', error);
        chrome.runtime.sendMessage({
            type: 'EXPORT_ERROR',
            payload: { error: error.message }
        });
    }
}

async function scrapeChat(tabId, url) {
    try {
        // Navigate
        await chrome.tabs.update(tabId, { url: url });

        // Wait for load
        await waitForTabLoad(tabId);

        // Add artificial delay for SPA content to render
        await new Promise(r => setTimeout(r, 2000));

        // Send message to content script
        // Note: Content script injects automatically on gemini.google.com
        const response = await chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_CONTENT' });
        return response ? response.content : { text: 'Error scraping: No response' };

    } catch (e) {
        console.warn('Scrape error on', url, e);
        return { text: 'Error scraping: ' + e.message };
    }
}

function waitForTabLoad(tabId) {
    return new Promise(resolve => {
        const listener = (tid, changeInfo) => {
            if (tid === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

function convertToMarkdown(content, chat) {
    return `# ${chat.title}\n\nURL: ${chat.url}\n\nDate: ${new Date().toLocaleString()}\n\n---\n\n${content.text}`;
}
