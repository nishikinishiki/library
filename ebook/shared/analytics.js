(() => {
    "use strict";

    const PROGRESS_THRESHOLDS = [
        10, 20, 30, 40, 50,
        60, 70, 80, 90, 100
    ];

    const sentProgress = new Set();

    function getEbookId() {
        const parts = location.pathname
            .split("/")
            .filter(Boolean);
        const ebookIndex = parts.indexOf("ebook");

        return ebookIndex >= 0
            ? parts[ebookIndex + 1] ?? "unknown"
            : "unknown";
    }

    function pushEvent(event, params = {}) {
        window.dataLayer = window.dataLayer || [];

        window.dataLayer.push({
            event,
            ebook_id: getEbookId(),
            ...params
        });
    }

    function trackProgress(currentPage, totalPages) {
        if (
            !Number.isFinite(currentPage) ||
            !Number.isFinite(totalPages) ||
            totalPages <= 0
        ) {
            return;
        }

        const progress = Math.floor(
            currentPage / totalPages * 100
        );

        PROGRESS_THRESHOLDS.forEach((threshold) => {
            if (
                progress < threshold ||
                sentProgress.has(threshold)
            ) {
                return;
            }

            sentProgress.add(threshold);

            pushEvent("ebook_progress", {
                progress_percent: threshold
            });
        });
    }

    document.addEventListener("reader:ready", (event) => {
        pushEvent("ebook_open");

        trackProgress(
            event.detail.currentPage,
            event.detail.totalPages
        );
    });

    document.addEventListener("reader:pagechange", (event) => {
        trackProgress(
            event.detail.currentPage,
            event.detail.totalPages
        );
    });
})();
