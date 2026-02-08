(function () {
    'use strict';

    function createThemeSyncController() {
        let themeObserver = null;
        let themeUpdateTimer = null;
        let currentThemeMode = null;

        function parseRgbColor(colorString) {
            if (!colorString) return null;
            const m = colorString.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if (!m) return null;
            return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
        }

        function getPageBackgroundColor() {
            try {
                const bodyBg = window.getComputedStyle(document.body).backgroundColor;
                if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') return bodyBg;
            } catch (_) { }
            try {
                return window.getComputedStyle(document.documentElement).backgroundColor;
            } catch (_) { }
            return '';
        }

        function detectPageThemeMode() {
            try {
                const scheme = window.getComputedStyle(document.documentElement).colorScheme;
                if (scheme && scheme.includes('dark')) return 'dark';
                if (scheme && scheme.includes('light')) return 'light';
            } catch (_) { }

            const rgb = parseRgbColor(getPageBackgroundColor());
            if (rgb) {
                const luminance = (0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b);
                return luminance < 128 ? 'dark' : 'light';
            }

            try {
                return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            } catch (_) { }
            return 'dark';
        }

        function applyThemeVariables(mode) {
            const darkVars = {
                '--ge-panel-bg': '#111827',
                '--ge-panel-text': '#F9FAFB',
                '--ge-text-muted': '#D1D5DB',
                '--ge-text-muted-2': '#9CA3AF',
                '--ge-border': '#374151',
                '--ge-border-hover': '#6B7280',
                '--ge-surface': '#1F2937',
                '--ge-surface-2': '#111827',
                '--ge-surface-hover': '#1F2937',
                '--ge-divider': '#1F2937',
                '--ge-primary': '#1E40AF',
                '--ge-primary-hover': '#1D4ED8',
                '--ge-primary-border': '#1D4ED8',
                '--ge-on-primary': '#F9FAFB',
                '--ge-success': '#059669',
                '--ge-success-border': '#047857',
                '--ge-danger': '#DC2626',
                '--ge-danger-border': '#B91C1C',
                '--ge-neutral': '#374151',
                '--ge-neutral-border': '#4B5563',
                '--ge-scroll-thumb': '#374151',
                '--ge-scroll-thumb-hover': '#4B5563'
            };

            const lightVars = {
                '--ge-panel-bg': '#F9FAFB',
                '--ge-panel-text': '#111827',
                '--ge-text-muted': '#374151',
                '--ge-text-muted-2': '#6B7280',
                '--ge-border': '#E5E7EB',
                '--ge-border-hover': '#9CA3AF',
                '--ge-surface': '#FFFFFF',
                '--ge-surface-2': '#F3F4F6',
                '--ge-surface-hover': '#F3F4F6',
                '--ge-divider': '#E5E7EB',
                '--ge-primary': '#1E40AF',
                '--ge-primary-hover': '#1D4ED8',
                '--ge-primary-border': '#1D4ED8',
                '--ge-on-primary': '#F9FAFB',
                '--ge-success': '#059669',
                '--ge-success-border': '#047857',
                '--ge-danger': '#DC2626',
                '--ge-danger-border': '#B91C1C',
                '--ge-neutral': '#374151',
                '--ge-neutral-border': '#4B5563',
                '--ge-scroll-thumb': '#D1D5DB',
                '--ge-scroll-thumb-hover': '#9CA3AF'
            };

            const vars = mode === 'light' ? lightVars : darkVars;
            Object.entries(vars).forEach(([key, value]) => {
                document.documentElement.style.setProperty(key, value);
            });
            currentThemeMode = mode;
        }

        function refreshThemeIfNeeded() {
            const nextMode = detectPageThemeMode();
            if (nextMode === currentThemeMode) return;
            applyThemeVariables(nextMode);
        }

        function scheduleThemeRefresh(delayMs = 120) {
            if (themeUpdateTimer) window.clearTimeout(themeUpdateTimer);
            themeUpdateTimer = window.setTimeout(() => {
                themeUpdateTimer = null;
                refreshThemeIfNeeded();
            }, delayMs);
        }

        function startThemeSync() {
            applyThemeVariables(detectPageThemeMode());

            if (themeObserver) themeObserver.disconnect();
            themeObserver = new MutationObserver(() => scheduleThemeRefresh(120));
            try {
                themeObserver.observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'color-scheme']
                });
            } catch (_) { }
            try {
                themeObserver.observe(document.body, {
                    attributes: true,
                    attributeFilter: ['class', 'style']
                });
            } catch (_) { }

            try {
                const media = window.matchMedia('(prefers-color-scheme: dark)');
                if (media && media.addEventListener) media.addEventListener('change', () => scheduleThemeRefresh(120));
                else if (media && media.addListener) media.addListener(() => scheduleThemeRefresh(120));
            } catch (_) { }
        }

        return {
            startThemeSync
        };
    }

    window.GeminiExportThemeSync = {
        createThemeSyncController
    };
})();
