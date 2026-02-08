(function () {
    'use strict';

    function createScrollEngine(options = {}) {
        const t = options.t || {};
        const maxScrollAttempts = Number(options.maxScrollAttempts || 300);
        const scrollDelayMs = Number(options.scrollDelayMs || 1000);
        const scrollIncrementFactor = Number(options.scrollIncrementFactor || 0.85);
        const scrollStabilityChecks = Number(options.scrollStabilityChecks || 3);
        const delay = typeof options.delay === 'function'
            ? options.delay
            : (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
        const getMainScrollerElement = typeof options.getMainScrollerElement === 'function'
            ? options.getMainScrollerElement
            : () => null;
        const updateStatus = typeof options.updateStatus === 'function'
            ? options.updateStatus
            : () => { };
        const extractDataIncrementalDispatch = typeof options.extractDataIncrementalDispatch === 'function'
            ? options.extractDataIncrementalDispatch
            : () => false;
        const extractDataIncrementalAiStudio = typeof options.extractDataIncrementalAiStudio === 'function'
            ? options.extractDataIncrementalAiStudio
            : () => false;
        const alertFn = typeof options.alertFn === 'function'
            ? options.alertFn
            : (message) => window.alert(message);
        const getIsScrolling = typeof options.getIsScrolling === 'function'
            ? options.getIsScrolling
            : () => false;
        const setIsScrolling = typeof options.setIsScrolling === 'function'
            ? options.setIsScrolling
            : () => { };
        const resetCollectionAndCounters = typeof options.resetCollectionAndCounters === 'function'
            ? options.resetCollectionAndCounters
            : () => { };
        const getScrollCount = typeof options.getScrollCount === 'function'
            ? options.getScrollCount
            : () => 0;
        const setScrollCount = typeof options.setScrollCount === 'function'
            ? options.setScrollCount
            : () => { };
        const getNoChangeCounter = typeof options.getNoChangeCounter === 'function'
            ? options.getNoChangeCounter
            : () => 0;
        const setNoChangeCounter = typeof options.setNoChangeCounter === 'function'
            ? options.setNoChangeCounter
            : () => { };
        const getCollectedSize = typeof options.getCollectedSize === 'function'
            ? options.getCollectedSize
            : () => 0;

        async function autoScrollDown() {
            console.log(t.logFindingScroller);
            setIsScrolling(true);
            resetCollectionAndCounters();

            const scroller = getMainScrollerElement();
            if (!scroller) {
                updateStatus(t.statusScrollError);
                alertFn(t.statusScrollNotFoundAlert);
                setIsScrolling(false);
                return false;
            }

            console.log('使用的滚动元素(滚动导出):', scroller);
            const isWindowScroller = (scroller === document.documentElement || scroller === document.body);
            const getScrollTop = () => isWindowScroller ? window.scrollY : scroller.scrollTop;
            const getScrollHeight = () => isWindowScroller ? document.documentElement.scrollHeight : scroller.scrollHeight;
            const getClientHeight = () => isWindowScroller ? window.innerHeight : scroller.clientHeight;

            updateStatus(t.statusScrolling(0, maxScrollAttempts, 0));
            let lastScrollHeight = -1;

            while (getScrollCount() < maxScrollAttempts && getIsScrolling()) {
                const currentScrollTop = getScrollTop();
                const currentScrollHeight = getScrollHeight();
                const currentClientHeight = getClientHeight();

                if (currentScrollHeight === lastScrollHeight) {
                    setNoChangeCounter(getNoChangeCounter() + 1);
                } else {
                    setNoChangeCounter(0);
                }
                lastScrollHeight = currentScrollHeight;

                if (getNoChangeCounter() >= scrollStabilityChecks && currentScrollTop + currentClientHeight >= currentScrollHeight - 20) {
                    console.log(t.statusScrollCompleteBottom);
                    updateStatus(t.statusScrollCompleteBottom);
                    break;
                }

                if (currentScrollTop === 0 && getScrollCount() > 10) {
                    console.log(t.statusScrollCompleteTop);
                    updateStatus(t.statusScrollCompleteTop);
                    break;
                }

                const targetScrollTop = currentScrollTop + (currentClientHeight * scrollIncrementFactor);
                if (isWindowScroller) {
                    window.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
                } else {
                    scroller.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
                }

                const nextScrollCount = getScrollCount() + 1;
                setScrollCount(nextScrollCount);
                updateStatus(t.statusScrolling(nextScrollCount, maxScrollAttempts, getCollectedSize()));

                await delay(scrollDelayMs);

                try {
                    extractDataIncrementalDispatch();
                } catch (error) {
                    console.warn('调度提取失败，回退 AI Studio 提取', error);
                    try { extractDataIncrementalAiStudio(); } catch (_) { }
                }

                if (!getIsScrolling()) {
                    console.log('检测到手动停止信号 (滚动导出)，退出滚动循环。');
                    break;
                }
            }

            if (!getIsScrolling() && getScrollCount() < maxScrollAttempts) {
                updateStatus(t.statusScrollManualStop(getScrollCount()));
            } else if (getScrollCount() >= maxScrollAttempts) {
                updateStatus(t.statusScrollMaxAttempts(maxScrollAttempts));
            }

            setIsScrolling(false);
            return true;
        }

        return {
            autoScrollDown
        };
    }

    window.GeminiExportScrollEngine = {
        createScrollEngine
    };
})();
