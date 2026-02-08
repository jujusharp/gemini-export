(function () {
    'use strict';

    function createImageExporter(options = {}) {
        const cleanupMarkdown = typeof options.cleanupMarkdown === 'function'
            ? options.cleanupMarkdown
            : (text) => String(text || '').trim();
        const updateStatus = typeof options.updateStatus === 'function'
            ? options.updateStatus
            : () => { };
        const getCurrentTimestamp = typeof options.getCurrentTimestamp === 'function'
            ? options.getCurrentTimestamp
            : () => new Date().toISOString().replace(/[:.]/g, '-');
        const t = options.t || {};

        function sendRuntimeMessage(request) {
            return new Promise((resolve, reject) => {
                try {
                    chrome.runtime.sendMessage(request, (response) => {
                        const lastError = chrome.runtime.lastError;
                        if (lastError) {
                            reject(new Error(lastError.message || 'Unknown runtime error'));
                            return;
                        }
                        resolve(response);
                    });
                } catch (e) {
                    reject(e);
                }
            });
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
            if (dataUrlMatch) {
                return normalizeImageExtension(dataUrlMatch[1]);
            }

            try {
                const parsed = new URL(url, window.location.href);
                const extMatch = parsed.pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
                if (extMatch) return normalizeImageExtension(extMatch[1]);
            } catch (_) { }

            const formatMatch = url.match(/[?&](?:format|fm)=([a-zA-Z0-9]{2,5})/i);
            if (formatMatch) return normalizeImageExtension(formatMatch[1]);

            if (/=s\d+-rj\b/i.test(url) || /=w\d+-h\d+-rj\b/i.test(url)) return 'jpg';
            if (/webp/i.test(url)) return 'webp';
            if (/png/i.test(url)) return 'png';
            return 'jpg';
        }

        function isProbablyGeneratedImageElement(img) {
            if (!img) return false;

            const src = img.currentSrc || img.getAttribute('src') || '';
            if (!src) return false;
            if (!/^https?:|^data:/i.test(src)) return false;

            if (/maps\.googleapis\.com\/maps\/vt/i.test(src)) return false;
            if (/gstatic\.com\/images\/branding\/productlogos\/maps/i.test(src)) return false;
            if (/maps\.gstatic\.com\/mapfiles/i.test(src)) return false;

            if (img.closest('generated-image, single-image.generated-image, .generated-image, .generated-images, .attachment-container.generated-images, .image-container.replace-fife-images-at-export')) {
                return true;
            }

            if (/googleusercontent\.com\/gg\//i.test(src)) return true;
            return false;
        }

        function extractGeneratedImagesFromDom() {
            const candidates = Array.from(document.querySelectorAll(
                'generated-image img[src], .attachment-container.generated-images img[src], .image-container.replace-fife-images-at-export img[src], single-image.generated-image img[src], img.image[src]'
            ));

            const seen = new Set();
            const images = [];

            candidates.forEach((img) => {
                if (!isProbablyGeneratedImageElement(img)) return;
                const rawSrc = (img.currentSrc || img.getAttribute('src') || '').trim();
                if (!rawSrc) return;

                let absoluteUrl = rawSrc;
                try {
                    absoluteUrl = new URL(rawSrc, window.location.href).href;
                } catch (_) { }
                if (seen.has(absoluteUrl)) return;
                seen.add(absoluteUrl);

                images.push({
                    url: absoluteUrl,
                    alt: cleanupMarkdown((img.getAttribute('alt') || '').trim()),
                    extension: guessImageExtensionFromUrl(absoluteUrl)
                });
            });

            return images;
        }

        async function exportGeneratedImages(projectName) {
            const images = extractGeneratedImagesFromDom();
            if (!images.length) return { downloaded: 0, failed: 0, total: 0 };

            const statusText = typeof t.statusDownloadingImages === 'function'
                ? t.statusDownloadingImages(images.length)
                : `Downloading ${images.length} generated images...`;
            updateStatus(statusText);

            try {
                const response = await sendRuntimeMessage({
                    action: 'DOWNLOAD_IMAGE_BATCH',
                    payload: {
                        baseName: sanitizeFileNameSegment(projectName),
                        timestamp: getCurrentTimestamp(),
                        images
                    }
                });

                if (!response || response.status !== 'success') {
                    throw new Error(response?.message || 'No response from background service worker');
                }

                if (Number(response.failed || 0) > 0 && Number(response.downloaded || 0) === 0) {
                    throw new Error(`All image downloads failed (${response.failed})`);
                }

                return {
                    downloaded: Number(response.downloaded || 0),
                    failed: Number(response.failed || 0),
                    total: images.length
                };
            } catch (e) {
                console.warn('Generated image export failed:', e);
                return { downloaded: 0, failed: images.length, total: images.length, error: e };
            }
        }

        return {
            exportGeneratedImages
        };
    }

    window.GeminiExportImageExporter = {
        createImageExporter
    };
})();
