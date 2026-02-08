(function () {
    'use strict';

    function createExportDispatcher(options = {}) {
        const t = options.t || {};
        const getIsScrolling = typeof options.getIsScrolling === 'function'
            ? options.getIsScrolling
            : () => false;
        const setIsScrolling = typeof options.setIsScrolling === 'function'
            ? options.setIsScrolling
            : () => { };
        const getExportButton = typeof options.getExportButton === 'function'
            ? options.getExportButton
            : () => null;
        const updateStatus = typeof options.updateStatus === 'function'
            ? options.updateStatus
            : () => { };
        const onDialog = typeof options.onDialog === 'function'
            ? options.onDialog
            : () => { };
        const onCanvas = typeof options.onCanvas === 'function'
            ? options.onCanvas
            : () => { };
        const onBoth = typeof options.onBoth === 'function'
            ? options.onBoth
            : () => { };

        async function readExportSettings() {
            let format = 'md';
            let type = 'both';
            let removeWatermark = true;

            try {
                if (chrome && chrome.storage && chrome.storage.local) {
                    const settings = await chrome.storage.local.get(['exportFormat', 'exportType', 'removeWatermark']);
                    format = settings.exportFormat || 'md';
                    type = settings.exportType || 'both';
                    removeWatermark = settings.removeWatermark !== false;
                }
            } catch (e) {
                console.warn('Failed to read settings from chrome.storage, using defaults:', e);
            }

            return { format, type, removeWatermark };
        }

        async function handleExportClick() {
            const exportButton = getExportButton();
            if (!exportButton) {
                console.warn('Gemini Export: export button not ready.');
                return;
            }

            if (getIsScrolling()) {
                updateStatus(t.statusStop);
                setIsScrolling(false);
                exportButton.title = t.statusStop;
                exportButton.disabled = true;
                return;
            }

            const { format, type, removeWatermark } = await readExportSettings();

            window.__GEMINI_EXPORT_FORMAT = format;
            window.__GEMINI_EXPORT_REMOVE_WATERMARK = removeWatermark;

            console.log(t.logStartingExport(type, format));
            updateStatus(`${t.statusStarting} (${type}, ${format})`);

            if (type === 'dialog') {
                return onDialog();
            }
            if (type === 'canvas') {
                return onCanvas();
            }
            if (type === 'both') {
                return onBoth();
            }
        }

        return {
            handleExportClick
        };
    }

    window.GeminiExportDispatcher = {
        createExportDispatcher
    };
})();
