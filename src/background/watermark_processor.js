// Gemini visible watermark remover (Reverse Alpha Blending).
// Algorithm adapted from MIT-licensed:
// - journey-ad/gemini-watermark-remover
// - allenk/GeminiWatermarkTool
(function () {
    'use strict';

    const SMALL_SIZE = 48;
    const LARGE_SIZE = 96;
    const SMALL_MARGIN_MIN = 4;
    const SMALL_MARGIN_MAX = 64;
    const LARGE_MARGIN_MIN = 12;
    const LARGE_MARGIN_MAX = 128;
    const ALPHA_THRESHOLD = 0.002;
    const MAX_ALPHA = 0.99;
    const WHITE_LOGO_VALUE = 255;
    const DETECTION_MIN_CORRELATION = 0.28;
    const DETECTION_MIN_DARKENING = 4.0;

    const templateCache = new Map();

    function detectWatermarkConfig(width, height) {
        if (width > 1024 && height > 1024) {
            return {
                logoSize: LARGE_SIZE,
                minMarginRight: LARGE_MARGIN_MIN,
                maxMarginRight: LARGE_MARGIN_MAX,
                minMarginBottom: LARGE_MARGIN_MIN,
                maxMarginBottom: LARGE_MARGIN_MAX
            };
        }

        return {
            logoSize: SMALL_SIZE,
            minMarginRight: SMALL_MARGIN_MIN,
            maxMarginRight: SMALL_MARGIN_MAX,
            minMarginBottom: SMALL_MARGIN_MIN,
            maxMarginBottom: SMALL_MARGIN_MAX
        };
    }

    function buildLuminanceMap(imageData) {
        const pixelCount = imageData.width * imageData.height;
        const luminance = new Float32Array(pixelCount);
        const data = imageData.data;
        for (let i = 0; i < pixelCount; i++) {
            const idx = i * 4;
            luminance[i] = data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
        }
        return luminance;
    }

    function calculateAlphaMap(imageData) {
        const pixelCount = imageData.width * imageData.height;
        const alphaMap = new Float32Array(pixelCount);
        const data = imageData.data;

        for (let i = 0; i < pixelCount; i++) {
            const idx = i * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            alphaMap[i] = Math.max(r, g, b) / 255.0;
        }

        return alphaMap;
    }

    function buildAlphaTemplate(alphaMap, size) {
        const rawAlpha = [];
        const rawX = [];
        const rawY = [];

        for (let i = 0; i < alphaMap.length; i++) {
            const alpha = alphaMap[i];
            if (alpha < ALPHA_THRESHOLD) continue;
            rawAlpha.push(alpha);
            rawX.push(i % size);
            rawY.push(Math.floor(i / size));
        }

        if (rawAlpha.length === 0) {
            return {
                alphaMap,
                size,
                activeCount: 0,
                x: new Uint16Array(0),
                y: new Uint16Array(0),
                alpha: new Float32Array(0),
                normalizedAlpha: new Float32Array(0),
                normalizedAlphaSum: 0
            };
        }

        let alphaMean = 0;
        for (let i = 0; i < rawAlpha.length; i++) alphaMean += rawAlpha[i];
        alphaMean /= rawAlpha.length;

        let alphaVariance = 0;
        for (let i = 0; i < rawAlpha.length; i++) {
            const diff = rawAlpha[i] - alphaMean;
            alphaVariance += diff * diff;
        }
        alphaVariance /= rawAlpha.length;
        const alphaStd = Math.sqrt(alphaVariance) || 1e-6;

        const activeCount = rawAlpha.length;
        const x = new Uint16Array(activeCount);
        const y = new Uint16Array(activeCount);
        const alpha = new Float32Array(activeCount);
        const normalizedAlpha = new Float32Array(activeCount);
        let normalizedAlphaSum = 0;

        for (let i = 0; i < activeCount; i++) {
            x[i] = rawX[i];
            y[i] = rawY[i];
            alpha[i] = rawAlpha[i];
            const normalized = (rawAlpha[i] - alphaMean) / alphaStd;
            normalizedAlpha[i] = normalized;
            normalizedAlphaSum += normalized;
        }

        return {
            alphaMap,
            size,
            activeCount,
            x,
            y,
            alpha,
            normalizedAlpha,
            normalizedAlphaSum
        };
    }

    async function loadAlphaTemplate(size) {
        if (templateCache.has(size)) {
            return templateCache.get(size);
        }

        const assetPath = size === LARGE_SIZE
            ? 'src/background/assets/bg_96.png'
            : 'src/background/assets/bg_48.png';
        const assetUrl = chrome.runtime.getURL(assetPath);

        const response = await fetch(assetUrl);
        if (!response.ok) {
            throw new Error(`Failed to load watermark alpha asset: ${assetPath} (${response.status})`);
        }

        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);
        try {
            const canvas = new OffscreenCanvas(size, size);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                throw new Error('OffscreenCanvas 2d context unavailable.');
            }

            ctx.drawImage(imageBitmap, 0, 0, size, size);
            const imageData = ctx.getImageData(0, 0, size, size);
            const alphaMap = calculateAlphaMap(imageData);
            const template = buildAlphaTemplate(alphaMap, size);
            templateCache.set(size, template);
            return template;
        } finally {
            if (typeof imageBitmap.close === 'function') {
                imageBitmap.close();
            }
        }
    }

    function getSearchAxisBounds(length, size, minMargin, maxMargin) {
        const start = Math.max(0, length - maxMargin - size);
        const end = Math.min(length - size, length - minMargin - size);
        if (end < start) return null;
        return { start, end };
    }

    function computeCorrelationScore(luminanceMap, imageWidth, positionX, positionY, template) {
        const activeCount = template.activeCount;
        if (!activeCount) return Number.NEGATIVE_INFINITY;

        let sumPixel = 0;
        let sumPixelSq = 0;
        let sumPixelNormalizedAlpha = 0;

        const activeX = template.x;
        const activeY = template.y;
        const normalizedAlpha = template.normalizedAlpha;
        for (let i = 0; i < activeCount; i++) {
            const imageIndex = (positionY + activeY[i]) * imageWidth + (positionX + activeX[i]);
            const pixel = luminanceMap[imageIndex];
            sumPixel += pixel;
            sumPixelSq += pixel * pixel;
            sumPixelNormalizedAlpha += pixel * normalizedAlpha[i];
        }

        const pixelMean = sumPixel / activeCount;
        const pixelVariance = sumPixelSq / activeCount - pixelMean * pixelMean;
        if (pixelVariance <= 1e-6) return Number.NEGATIVE_INFINITY;

        const pixelStd = Math.sqrt(pixelVariance);
        const numerator = sumPixelNormalizedAlpha - pixelMean * template.normalizedAlphaSum;
        return numerator / (pixelStd * activeCount);
    }

    function clampByte(value) {
        return value < 0 ? 0 : value > 255 ? 255 : value;
    }

    function computeMeanDarkening(imageData, imageWidth, positionX, positionY, template) {
        const data = imageData.data;
        const activeCount = template.activeCount;
        if (!activeCount) return Number.NEGATIVE_INFINITY;

        let darkening = 0;
        let used = 0;

        const activeX = template.x;
        const activeY = template.y;
        const activeAlpha = template.alpha;

        for (let i = 0; i < activeCount; i++) {
            let alpha = activeAlpha[i];
            if (alpha < ALPHA_THRESHOLD) continue;
            alpha = Math.min(alpha, MAX_ALPHA);

            const oneMinusAlpha = 1.0 - alpha;
            if (oneMinusAlpha <= 0) continue;

            const pixelIndex = ((positionY + activeY[i]) * imageWidth + (positionX + activeX[i])) * 4;
            const watermarkedR = data[pixelIndex];
            const watermarkedG = data[pixelIndex + 1];
            const watermarkedB = data[pixelIndex + 2];

            const originalR = clampByte((watermarkedR - alpha * WHITE_LOGO_VALUE) / oneMinusAlpha);
            const originalG = clampByte((watermarkedG - alpha * WHITE_LOGO_VALUE) / oneMinusAlpha);
            const originalB = clampByte((watermarkedB - alpha * WHITE_LOGO_VALUE) / oneMinusAlpha);

            const beforeLum = watermarkedR * 0.2126 + watermarkedG * 0.7152 + watermarkedB * 0.0722;
            const afterLum = originalR * 0.2126 + originalG * 0.7152 + originalB * 0.0722;

            darkening += beforeLum - afterLum;
            used++;
        }

        if (!used) return Number.NEGATIVE_INFINITY;
        return darkening / used;
    }

    function locateWatermarkPosition(imageData, config, template) {
        const width = imageData.width;
        const height = imageData.height;
        const size = config.logoSize;

        const xBounds = getSearchAxisBounds(width, size, config.minMarginRight, config.maxMarginRight);
        const yBounds = getSearchAxisBounds(height, size, config.minMarginBottom, config.maxMarginBottom);
        if (!xBounds || !yBounds) return null;

        const luminanceMap = buildLuminanceMap(imageData);
        let bestCandidate = null;

        for (let y = yBounds.start; y <= yBounds.end; y++) {
            for (let x = xBounds.start; x <= xBounds.end; x++) {
                const correlation = computeCorrelationScore(luminanceMap, width, x, y, template);
                if (!Number.isFinite(correlation)) continue;
                if (!bestCandidate || correlation > bestCandidate.correlation) {
                    bestCandidate = { x, y, correlation };
                }
            }
        }

        if (!bestCandidate) return null;

        const darkening = computeMeanDarkening(imageData, width, bestCandidate.x, bestCandidate.y, template);
        return {
            x: bestCandidate.x,
            y: bestCandidate.y,
            width: size,
            height: size,
            correlation: bestCandidate.correlation,
            darkening
        };
    }

    function removeWatermarkPixels(imageData, alphaMap, position) {
        const imageWidth = imageData.width;
        const imageHeight = imageData.height;
        const data = imageData.data;

        const xStart = Math.max(0, position.x);
        const yStart = Math.max(0, position.y);
        const xEnd = Math.min(imageWidth, position.x + position.width);
        const yEnd = Math.min(imageHeight, position.y + position.height);
        const regionWidth = position.width;

        if (xStart >= xEnd || yStart >= yEnd) return;

        for (let y = yStart; y < yEnd; y++) {
            for (let x = xStart; x < xEnd; x++) {
                const localRow = y - position.y;
                const localCol = x - position.x;
                const alphaIdx = localRow * regionWidth + localCol;
                let alpha = alphaMap[alphaIdx];
                if (alpha < ALPHA_THRESHOLD) continue;

                alpha = Math.min(alpha, MAX_ALPHA);
                const oneMinusAlpha = 1.0 - alpha;
                if (oneMinusAlpha <= 0) continue;

                const pixelIdx = (y * imageWidth + x) * 4;
                for (let channel = 0; channel < 3; channel++) {
                    const watermarked = data[pixelIdx + channel];
                    const original = (watermarked - alpha * WHITE_LOGO_VALUE) / oneMinusAlpha;
                    data[pixelIdx + channel] = Math.max(0, Math.min(255, Math.round(original)));
                }
            }
        }
    }

    async function removeVisibleWatermarkFromBlob(blob, options = {}) {
        if (!blob) throw new Error('Missing input blob');
        const outputType = options.outputType || 'image/png';
        const outputQuality = Number.isFinite(options.outputQuality) ? options.outputQuality : 1;

        const bitmap = await createImageBitmap(blob);
        try {
            const width = bitmap.width;
            const height = bitmap.height;
            if (!width || !height) {
                throw new Error('Invalid image dimensions.');
            }

            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                throw new Error('OffscreenCanvas 2d context unavailable.');
            }

            ctx.drawImage(bitmap, 0, 0);
            const config = detectWatermarkConfig(width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            const alphaTemplate = await loadAlphaTemplate(config.logoSize);
            const position = locateWatermarkPosition(imageData, config, alphaTemplate);

            if (!position) {
                throw new Error('Unable to locate Gemini watermark region.');
            }
            if (position.correlation < DETECTION_MIN_CORRELATION || position.darkening < DETECTION_MIN_DARKENING) {
                throw new Error(
                    `Low watermark confidence (correlation=${position.correlation.toFixed(3)}, darkening=${position.darkening.toFixed(2)}).`
                );
            }

            removeWatermarkPixels(imageData, alphaTemplate.alphaMap, position);
            ctx.putImageData(imageData, 0, 0);

            const processedBlob = await canvas.convertToBlob({
                type: outputType,
                quality: outputQuality
            });

            return {
                blob: processedBlob,
                width,
                height,
                extension: outputType === 'image/webp' ? 'webp' : outputType === 'image/jpeg' ? 'jpg' : 'png',
                detection: {
                    score: position.correlation,
                    darkening: position.darkening,
                    x: position.x,
                    y: position.y,
                    size: position.width
                }
            };
        } finally {
            if (typeof bitmap.close === 'function') {
                bitmap.close();
            }
        }
    }

    globalThis.GeminiWatermarkProcessor = {
        removeVisibleWatermarkFromBlob
    };
})();
