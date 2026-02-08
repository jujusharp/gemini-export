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
        return false;
    }

    if (request.action === 'DOWNLOAD_IMAGE_BATCH') {
        handleImageBatchDownload(request.payload)
            .then((result) => {
                sendResponse({ status: 'success', ...result });
            })
            .catch((error) => {
                console.error('Image batch download failed:', error);
                sendResponse({ status: 'error', message: error.message || String(error) });
            });
        return true;
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

function sanitizeFileNameSegment(name) {
    return (name || 'GeminiChat')
        .replace(/[\\/:\*\?"<>\|]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'GeminiChat';
}

function normalizeImageExtension(ext) {
    const lower = (ext || '').toLowerCase();
    if (lower === 'jpeg' || lower === 'pjpeg') return 'jpg';
    if (lower === 'svg+xml') return 'svg';
    if (lower === 'x-icon') return 'ico';
    if (/^[a-z0-9]{2,5}$/.test(lower)) return lower;
    return 'jpg';
}

function guessImageExtensionFromUrl(url) {
    if (!url) return 'jpg';

    const dataUrlMatch = url.match(/^data:image\/([a-zA-Z0-9.+-]+);/i);
    if (dataUrlMatch) return normalizeImageExtension(dataUrlMatch[1]);

    try {
        const parsed = new URL(url);
        const pathExtMatch = parsed.pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
        if (pathExtMatch) return normalizeImageExtension(pathExtMatch[1]);
    } catch (_) { }

    const formatMatch = url.match(/[?&](?:format|fm)=([a-zA-Z0-9]{2,5})/i);
    if (formatMatch) return normalizeImageExtension(formatMatch[1]);

    if (/=s\d+-rj\b/i.test(url) || /=w\d+-h\d+-rj\b/i.test(url)) return 'jpg';
    if (/webp/i.test(url)) return 'webp';
    if (/png/i.test(url)) return 'png';
    return 'jpg';
}

function buildImageFilename(baseName, timestamp, index, image) {
    const safeBaseName = sanitizeFileNameSegment(baseName || 'GeminiChat');
    const safeTimestamp = sanitizeFileNameSegment(timestamp || '').slice(0, 40) ||
        new Date().toISOString().replace(/[:.]/g, '-');
    const extension = normalizeImageExtension(image?.extension || guessImageExtensionFromUrl(image?.url || ''));
    const fileIndex = String(index + 1).padStart(3, '0');
    return `${safeBaseName}_images_${safeTimestamp}/generated_${fileIndex}.${extension}`;
}

async function handleImageBatchDownload(payload) {
    const images = Array.isArray(payload?.images) ? payload.images : [];
    if (images.length === 0) {
        return { downloaded: 0, failed: 0, total: 0 };
    }

    const baseName = payload?.baseName || 'GeminiChat';
    const timestamp = payload?.timestamp || '';

    let downloaded = 0;
    let failed = 0;

    for (let i = 0; i < images.length; i++) {
        const image = images[i] || {};
        const imageUrl = typeof image.url === 'string' ? image.url.trim() : '';
        if (!imageUrl || !/^https?:|^data:/i.test(imageUrl)) {
            failed++;
            continue;
        }

        const filename = buildImageFilename(baseName, timestamp, i, image);
        try {
            await chrome.downloads.download({
                url: imageUrl,
                filename,
                saveAs: false,
                conflictAction: 'uniquify'
            });
            downloaded++;
        } catch (e) {
            failed++;
            console.warn('Failed to download generated image:', imageUrl, e);
        }
    }

    return { downloaded, failed, total: images.length };
}
