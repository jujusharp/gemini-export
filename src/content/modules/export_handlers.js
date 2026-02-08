(function () {
    'use strict';

    function createExportHandlers(options = {}) {
        const t = options.t || {};
        const exportTimeout = Number(options.exportTimeout || 3000);
        const getExportButton = typeof options.getExportButton === 'function'
            ? options.getExportButton
            : () => null;
        const updateStatus = typeof options.updateStatus === 'function'
            ? options.updateStatus
            : () => { };
        const delay = typeof options.delay === 'function'
            ? options.delay
            : (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
        const getProjectName = typeof options.getProjectName === 'function'
            ? options.getProjectName
            : () => 'GeminiChat';
        const extractCanvasContent = typeof options.extractCanvasContent === 'function'
            ? options.extractCanvasContent
            : () => [];
        const formatCanvasDataForExport = typeof options.formatCanvasDataForExport === 'function'
            ? options.formatCanvasDataForExport
            : () => null;
        const triggerExportDownload = typeof options.triggerExportDownload === 'function'
            ? options.triggerExportDownload
            : () => { };
        const exportGeneratedImages = typeof options.exportGeneratedImages === 'function'
            ? options.exportGeneratedImages
            : async () => ({ downloaded: 0, failed: 0, total: 0 });
        const getMainScrollerElement = typeof options.getMainScrollerElement === 'function'
            ? options.getMainScrollerElement
            : () => null;
        const getIsScrolling = typeof options.getIsScrolling === 'function'
            ? options.getIsScrolling
            : () => false;
        const setIsScrolling = typeof options.setIsScrolling === 'function'
            ? options.setIsScrolling
            : () => { };
        const clearScrollCollection = typeof options.clearScrollCollection === 'function'
            ? options.clearScrollCollection
            : () => { };
        const resetScrollCounters = typeof options.resetScrollCounters === 'function'
            ? options.resetScrollCounters
            : () => { };
        const autoScrollDown = typeof options.autoScrollDown === 'function'
            ? options.autoScrollDown
            : async () => false;
        const extractDataIncrementalAiStudio = typeof options.extractDataIncrementalAiStudio === 'function'
            ? options.extractDataIncrementalAiStudio
            : () => false;
        const collectScrollData = typeof options.collectScrollData === 'function'
            ? options.collectScrollData
            : () => [];
        const formatCombinedDataForExport = typeof options.formatCombinedDataForExport === 'function'
            ? options.formatCombinedDataForExport
            : () => null;
        const formatAndExport = typeof options.formatAndExport === 'function'
            ? options.formatAndExport
            : () => null;
        const getCollectedDataSize = typeof options.getCollectedDataSize === 'function'
            ? options.getCollectedDataSize
            : () => 0;
        const alertFn = typeof options.alertFn === 'function'
            ? options.alertFn
            : (message) => window.alert(message);

        function appendWatermarkStats(message, imageExport) {
            if (!imageExport || imageExport.removeWatermark !== true) {
                return message;
            }
            const removed = Number(imageExport.watermarkRemoved || 0);
            const fallback = Number(imageExport.watermarkFallback || 0);
            return `${message} (Watermark removed: ${removed}, fallback: ${fallback})`;
        }

        function scheduleButtonReset() {
            const button = getExportButton();
            window.setTimeout(() => {
                const latestButton = getExportButton();
                if (!latestButton) return;
                latestButton.title = t.btnExport;
                latestButton.disabled = false;
                updateStatus('');
            }, exportTimeout);
            return button;
        }

        function resetScrollerToTopIfNeeded() {
            const scroller = getMainScrollerElement();
            if (!scroller) return Promise.resolve();

            updateStatus(t.statusReset);
            const isWindowScroller = (scroller === document.documentElement || scroller === document.body);
            if (isWindowScroller) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                scroller.scrollTo({ top: 0, behavior: 'smooth' });
            }

            return delay(1500);
        }

        async function handleCanvasExtraction() {
            const exportButton = getExportButton();
            if (!exportButton) return;

            console.log('Starting Canvas Export...');
            exportButton.disabled = true;
            exportButton.title = t.btnProcessing;

            try {
                updateStatus(t.statusStep1);
                const projectName = getProjectName();
                const canvasData = extractCanvasContent();

                if (canvasData.length === 0) {
                    alertFn(t.statusNoCanvas);
                    updateStatus(`Canvas: ${t.statusNoCanvas}`);
                } else {
                    updateStatus(t.statusProcessing(canvasData.length));
                    const exportData = formatCanvasDataForExport(canvasData, 'export');
                    triggerExportDownload(exportData);

                    const imageExport = await exportGeneratedImages(projectName);
                    if (imageExport.downloaded > 0) {
                        updateStatus(appendWatermarkStats(
                            t.statusSuccessWithImages(exportData.filename, imageExport.downloaded),
                            imageExport
                        ));
                    } else if (imageExport.error) {
                        updateStatus(t.statusSuccessWithImageWarning(exportData.filename, imageExport.error.message));
                    } else {
                        updateStatus(t.statusSuccess(exportData.filename));
                    }
                }
            } catch (error) {
                console.error('Canvas Error:', error);
                updateStatus(t.statusError(error.message));
            } finally {
                scheduleButtonReset();
            }
        }

        async function handleCombinedExtraction() {
            const exportButton = getExportButton();
            if (!exportButton) return;

            console.log('Starting Combined Export...');
            const projectName = getProjectName();

            exportButton.title = t.btnStop;
            exportButton.disabled = false;

            try {
                updateStatus(t.statusStep1);
                const canvasData = extractCanvasContent();

                updateStatus(t.statusStep2);
                clearScrollCollection();
                setIsScrolling(true);
                resetScrollCounters();

                await resetScrollerToTopIfNeeded();

                const scrollSuccess = await autoScrollDown();
                if (scrollSuccess !== false) {
                    updateStatus(t.statusProcessing(getCollectedDataSize()));
                    await delay(500);
                    extractDataIncrementalAiStudio();
                    await delay(200);
                } else {
                    throw new Error('Scroll failed');
                }

                updateStatus(t.statusStep3);
                const scrollData = collectScrollData();

                const combinedData = formatCombinedDataForExport(scrollData, canvasData);
                triggerExportDownload(combinedData);

                const imageExport = await exportGeneratedImages(projectName);
                if (imageExport.downloaded > 0) {
                    updateStatus(appendWatermarkStats(
                        t.statusSuccessWithImages(combinedData.filename, imageExport.downloaded),
                        imageExport
                    ));
                } else if (imageExport.error) {
                    updateStatus(t.statusSuccessWithImageWarning(combinedData.filename, imageExport.error.message));
                } else {
                    updateStatus(t.statusSuccess(combinedData.filename));
                }
                exportButton.title = t.btnSuccess;
            } catch (error) {
                console.error('Combined Export Error:', error);
                updateStatus(t.statusError(error.message));
                exportButton.title = t.btnError;
            } finally {
                setIsScrolling(false);
                scheduleButtonReset();
            }
        }

        async function formatAndTriggerDownloadScroll() {
            const exportButton = getExportButton();
            if (!exportButton) return;

            updateStatus(t.logGeneratingFile(getCollectedDataSize()));
            const projectName = getProjectName();
            const sorted = collectScrollData();

            if (!sorted.length) {
                updateStatus(t.statusNoDialog);
                alertFn(t.statusNoDialog);
                exportButton.title = t.btnExport;
                exportButton.disabled = false;
                updateStatus('');
                return;
            }

            try {
                const pack = formatAndExport(sorted, 'scroll');
                triggerExportDownload(pack);
                const imageExport = await exportGeneratedImages(projectName);
                if (imageExport.downloaded > 0) {
                    updateStatus(appendWatermarkStats(
                        t.statusSuccessWithImages(pack.filename, imageExport.downloaded),
                        imageExport
                    ));
                } else if (imageExport.error) {
                    updateStatus(t.statusSuccessWithImageWarning(pack.filename, imageExport.error.message));
                } else {
                    updateStatus(t.statusSuccess(pack.filename));
                }
                exportButton.title = t.btnSuccess;
            } catch (e) {
                console.error('File generation failed:', e);
                exportButton.title = t.btnError;
                alertFn(`Error generating file: ${e.message}`);
            }

            scheduleButtonReset();
        }

        async function handleScrollExtraction() {
            const exportButton = getExportButton();
            if (!exportButton) return;
            if (getIsScrolling()) return;

            exportButton.title = t.btnStop;
            exportButton.disabled = false;

            await resetScrollerToTopIfNeeded();
            updateStatus(t.statusScanning);

            try {
                const scrollSuccess = await autoScrollDown();
                if (scrollSuccess !== false) {
                    exportButton.title = t.btnProcessing;
                    updateStatus(t.statusProcessing(getCollectedDataSize()));
                    await delay(500);
                    extractDataIncrementalAiStudio();
                    await delay(200);
                    await formatAndTriggerDownloadScroll();
                } else {
                    exportButton.title = t.btnFailed;
                    scheduleButtonReset();
                }
            } catch (error) {
                console.error('Scroll Error:', error);
                updateStatus(t.statusError(error.message));
                exportButton.title = t.btnError;
                scheduleButtonReset();
                setIsScrolling(false);
            } finally {
                setIsScrolling(false);
            }
        }

        return {
            handleCanvasExtraction,
            handleCombinedExtraction,
            formatAndTriggerDownloadScroll,
            handleScrollExtraction
        };
    }

    window.GeminiExportHandlers = {
        createExportHandlers
    };
})();
