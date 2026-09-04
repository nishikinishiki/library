(() => {
    "use strict";

    function cssTimeMs(name, fallback) {
        const raw = getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim();
        if (!raw) return fallback;

        const value = parseFloat(raw);
        if (!Number.isFinite(value)) return fallback;

        return raw.endsWith("ms")
            ? value
            : raw.endsWith("s")
                ? value * 1000
                : fallback;
    }

    const CONFIG = {
        font: {
            sizes: [14, 17, 20],
            labels: ["小", "中", "大"],
            defaultSize: 17
        },
        pageTurn: {
            duration: cssTimeMs("--page-turn-duration", 220),
            thresholdRatio: 0.18,
            flickVelocity: 0.42,
            flickDistance: 24
        },
        overview: {
            minScale: 0.56,
            maxScale: 0.72,
            horizontalReserve: 118,
            verticalReserve: 176,
            fadeDuration: 90
        }
    };

    const COLOPHON = {
        publisher: [
            "J.P.RETURNS 編集部",
            "https://jpreturns.com/",
            "〒100-6923 東京都千代田区丸の内 2-6-1 丸の内パークビルディング23階",
            "© J.P.Returns. All rights reserved"
        ],
        copyright: [
            "本書の全部または一部について、許可なく複製・転載・配信・改変すること、ならびに有償・無償を問わず第三者へ譲渡することを禁止します。"
        ],
        notice: [
            "本書は、情報提供および学習を目的として制作したものであり、特定の投資成果や将来の運用成績を保証するものではありません。",
            "本書の内容に基づく投資・運用その他の判断は、ご自身の責任において行ってください。これにより生じた損失その他の結果について、J.P.RETURNS株式会社は責任を負いかねます。",
            "なお、本書に記載されている情報・事例は執筆時点のものであり、今後変更される場合があります。"
        ]
    };

    function sameInlineMarks(a, b) {
        return a.length === b.length && a.every((mark, index) => mark === b[index]);
    }

    function appendInlineSegment(segments, segment) {
        if (!segment) return;

        const last = segments[segments.length - 1];
        if (
            segment.type === "text" &&
            last?.type === "text" &&
            sameInlineMarks(last.marks, segment.marks)
        ) {
            last.text += segment.text;
            return;
        }

        segments.push(segment);
    }

    function parseInlineText(
        text,
        footnoteDefinitions,
        onFootnoteReference = null,
        marks = []
    ) {
        const segments = [];
        let index = 0;

        const pushText = (value) => {
            if (!value) return;
            appendInlineSegment(segments, {
                type: "text",
                text: value,
                marks: [...marks]
            });
        };

        while (index < text.length) {
            if (text[index] === "\n") {
                segments.push({ type: "break" });
                index += 1;
                continue;
            }

            if (text.startsWith("**", index)) {
                const end = text.indexOf("**", index + 2);
                if (end !== -1) {
                    const inner = text.slice(index + 2, end);
                    parseInlineText(
                        inner,
                        footnoteDefinitions,
                        onFootnoteReference,
                        [...marks, "strong"]
                    ).forEach((segment) => appendInlineSegment(segments, segment));
                    index = end + 2;
                    continue;
                }
            }

            if (text.startsWith("<small>", index)) {
                const end = text.indexOf("</small>", index + 7);
                if (end !== -1) {
                    const inner = text.slice(index + 7, end);
                    parseInlineText(
                        inner,
                        footnoteDefinitions,
                        onFootnoteReference,
                        [...marks, "small"]
                    ).forEach((segment) => appendInlineSegment(segments, segment));
                    index = end + 8;
                    continue;
                }
            }

            const footnote = text.slice(index).match(/^\[\^([^\]]+)\]/);
            if (footnote) {
                const id = footnote[1].trim();
                if (footnoteDefinitions.has(id)) {
                    if (onFootnoteReference) onFootnoteReference(id);
                    segments.push({
                        type: "footnote-ref",
                        label: id
                    });
                    index += footnote[0].length;
                    continue;
                }
            }

            pushText(text[index]);
            index += 1;
        }

        return segments;
    }

    function inlineSegmentLength(segment) {
        if (segment.type === "text") return [...segment.text].length;
        return 1;
    }

    function inlineLength(segments) {
        return segments.reduce(
            (total, segment) => total + inlineSegmentLength(segment),
            0
        );
    }

    function sliceInlineSegments(segments, start, count = Infinity) {
        if (count <= 0) return [];

        const result = [];
        const end = start + count;
        let position = 0;

        segments.forEach((segment) => {
            const length = inlineSegmentLength(segment);
            const segmentStart = position;
            const segmentEnd = position + length;
            position = segmentEnd;

            if (segmentEnd <= start || segmentStart >= end) return;

            if (segment.type !== "text") {
                result.push({ ...segment });
                return;
            }

            const chars = [...segment.text];
            const from = Math.max(0, start - segmentStart);
            const to = Math.min(length, end - segmentStart);
            const text = chars.slice(from, to).join("");
            if (!text) return;

            appendInlineSegment(result, {
                ...segment,
                text,
                marks: [...segment.marks]
            });
        });

        return result;
    }

    function dropInlineSegments(segments, count) {
        return sliceInlineSegments(segments, count);
    }

    function inlinePlainText(segments) {
        return segments.map((segment) => {
            if (segment.type === "text") return segment.text;
            if (segment.type === "break") return " ";
            if (segment.type === "footnote-ref") return segment.label;
            return "";
        }).join("");
    }

    function parseBookMarkdown(md) {
        const book = {
            title: "無題",
            published: "",
            cover: { src: "", alt: "表紙" },
            chapters: []
        };

        const parts = md.trim().split(/^---\s*$/m);
        const frontmatter = parts.length >= 3 ? parts[1] : "";
        const body = parts.length >= 3
            ? parts.slice(2).join("---")
            : md;

        frontmatter.split("\n").forEach((line) => {
            const separator = line.indexOf(":");
            if (separator < 0) return;

            const key = line.slice(0, separator).trim();
            const value = line.slice(separator + 1).trim();

            if (key === "title") book.title = value;
            if (key === "cover") book.cover.src = value;
            if (key === "published") book.published = value;
        });

        let currentChapter = null;
        let paragraphBuffer = [];
        let currentList = null;
        let currentFootnote = null;
        let pendingParagraphClasses = [];
        const footnoteDefinitions = new Map();

        function flushParagraph() {
            if (!paragraphBuffer.length || !currentChapter) {
                paragraphBuffer = [];
                return;
            }

            currentChapter.blocks.push({
                type: "paragraph",
                text: paragraphBuffer.join("\n"),
                classes: [...pendingParagraphClasses]
            });
            paragraphBuffer = [];
            pendingParagraphClasses = [];
        }

        function flushList() {
            if (!currentList || !currentChapter) {
                currentList = null;
                return;
            }

            currentChapter.blocks.push(currentList);
            currentList = null;
        }

        function flushFootnote() {
            if (!currentFootnote) return;

            footnoteDefinitions.set(
                currentFootnote.id,
                currentFootnote.lines.join("\n").trim()
            );
            currentFootnote = null;
        }

        function flushTextBlocks() {
            flushParagraph();
            flushList();
        }

        function resetPendingParagraphStyle() {
            pendingParagraphClasses = [];
        }

        body.split("\n").forEach((rawLine) => {
            const line = rawLine.trim();

            if (currentFootnote) {
                const continuation = rawLine.match(/^(?: {4}|\t)(.*)$/);
                if (continuation) {
                    currentFootnote.lines.push(continuation[1]);
                    return;
                }
                flushFootnote();
            }

            if (!line) {
                flushTextBlocks();
                return;
            }

            const paragraphStyle = line.match(/^\{(.+)\}$/);
            if (paragraphStyle) {
                const classes = paragraphStyle[1].trim().split(/\s+/);
                const allowedClasses = new Set([".no-indent", ".small-text"]);

                if (classes.every((className) => allowedClasses.has(className))) {
                    flushTextBlocks();
                    pendingParagraphClasses = classes.map((className) =>
                        className.slice(1)
                    );
                    return;
                }
            }

            if (line.startsWith("# ")) {
                flushTextBlocks();
                resetPendingParagraphStyle();
                currentChapter = {
                    title: line.replace(/^#\s+/, ""),
                    blocks: []
                };
                book.chapters.push(currentChapter);
                return;
            }

            const footnoteDefinition = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
            if (footnoteDefinition) {
                flushTextBlocks();
                currentFootnote = {
                    id: footnoteDefinition[1].trim(),
                    lines: [footnoteDefinition[2]]
                };
                return;
            }

            if (!currentChapter) return;

            if (line.startsWith("### ")) {
                flushTextBlocks();
                resetPendingParagraphStyle();
                currentChapter.blocks.push({
                    type: "h3",
                    text: line.replace(/^###\s+/, "")
                });
                return;
            }

            if (line.startsWith("## ")) {
                flushTextBlocks();
                resetPendingParagraphStyle();
                currentChapter.blocks.push({
                    type: "h2",
                    text: line.replace(/^##\s+/, "")
                });
                return;
            }

            const image = line.match(/^!\[(.*?)\]\((.*?)\)(\{page\})?$/);
            if (image) {
                flushTextBlocks();
                resetPendingParagraphStyle();
                currentChapter.blocks.push({
                    type: image[3] ? "full-image" : "image",
                    alt: image[1],
                    src: image[2]
                });
                return;
            }

            const unorderedListItem = line.match(/^[-*+]\s+(.+)$/);
            if (unorderedListItem) {
                flushParagraph();
                resetPendingParagraphStyle();

                if (!currentList || currentList.ordered) {
                    flushList();
                    currentList = {
                        type: "list",
                        ordered: false,
                        items: []
                    };
                }

                currentList.items.push(unorderedListItem[1]);
                return;
            }

            const orderedListItem = line.match(/^(\d+)\.\s+(.+)$/);
            if (orderedListItem) {
                flushParagraph();
                resetPendingParagraphStyle();

                if (!currentList || !currentList.ordered) {
                    flushList();
                    currentList = {
                        type: "list",
                        ordered: true,
                        start: Number(orderedListItem[1]),
                        items: []
                    };
                }

                currentList.items.push(orderedListItem[2]);
                return;
            }

            flushList();
            paragraphBuffer.push(line);
        });

        flushFootnote();
        flushTextBlocks();

        const placedFootnotes = new Set();

        function prepareBlockInline(block, onFootnoteReference) {
            if (["h2", "h3", "paragraph"].includes(block.type)) {
                block.inline = parseInlineText(
                    block.text,
                    footnoteDefinitions,
                    onFootnoteReference
                );
                return;
            }

            if (block.type === "list") {
                block.items = block.items.map((text) => ({
                    text,
                    inline: parseInlineText(
                        text,
                        footnoteDefinitions,
                        onFootnoteReference
                    )
                }));
            }
        }

        function createFootnotesBlock(ids) {
            return {
                type: "footnotes",
                items: ids.map((id) => {
                    const text = footnoteDefinitions.get(id) ?? "";
                    return {
                        label: id,
                        text,
                        inline: parseInlineText(text, footnoteDefinitions)
                    };
                })
            };
        }

        function finalizeChapter(chapter) {
            const output = [];
            let pendingFootnoteIds = [];

            const registerFootnote = (id) => {
                if (placedFootnotes.has(id)) return;
                placedFootnotes.add(id);
                pendingFootnoteIds.push(id);
            };

            const flushScopedFootnotes = () => {
                if (!pendingFootnoteIds.length) return;
                output.push(createFootnotesBlock(pendingFootnoteIds));
                pendingFootnoteIds = [];
            };

            chapter.titleInline = parseInlineText(
                chapter.title,
                footnoteDefinitions,
                registerFootnote
            );
            chapter.titleText = inlinePlainText(chapter.titleInline);

            chapter.blocks.forEach((block) => {
                if (block.type === "h2") {
                    flushScopedFootnotes();
                }

                prepareBlockInline(block, registerFootnote);
                output.push(block);
            });

            flushScopedFootnotes();
            chapter.blocks = output;
        }

        book.chapters.forEach(finalizeChapter);
        return book;
    }

    if (!window.bookMarkdown) {
        console.error("書籍データが見つかりません。data.jsが正しく読み込まれているか確認してください。");
        return;
    }

    const book = parseBookMarkdown(window.bookMarkdown);
    document.title = `${book.title} | JPリターンズ`;

    const fontButtonsHTML = CONFIG.font.sizes
        .map((size, index) =>
            `<button class="font-button" data-font-size="${size}" aria-pressed="false">${CONFIG.font.labels[index]}</button>`
        )
        .join("");

    document.body.innerHTML = `
    <header class="topbar">
        <button class="icon-button" id="tocOpenButton" aria-label="目次" title="目次">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 8h14v-2H7v2zm0-4h14v-2H7v2zm0-6v2h14V7H7z"/>
          </svg>
        </button>
        <div class="topbar__title" id="topbarTitle"></div>
        <div class="topbar__actions">
          <button class="text-button" aria-label="文字サイズ" title="文字サイズ" popovertarget="displayPopover">Aa</button>

          <button class="icon-button" id="overviewButton" aria-label="俯瞰表示" title="俯瞰表示">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z"/>
            </svg>
          </button>
        </div>
      </header>

      <main class="reader-shell" id="readerShell">
        <div class="stage">
          <article class="page-card page-card--prev" id="prevPage"></article>
          <article class="page-card page-card--current" id="currentPage"></article>
          <article class="page-card page-card--next" id="nextPage"></article>
        </div>

        <div class="overview-scroller" id="overviewScroller" aria-label="ページ一覧">
          <div class="overview-strip" id="overviewStrip"></div>
        </div>
      </main>

      <footer class="bottom-bar">
        <input class="page-slider" id="pageSlider" type="range" min="1" max="1" step="any" value="1" />
        <div class="page-counter" id="pageCounter">1/1</div>
      </footer>

      <section class="popover" id="displayPopover" popover="auto">
        <h2 class="popover__title">文字サイズ</h2>
        <div class="font-control">${fontButtonsHTML}</div>
      </section>

      <dialog class="toc-dialog" id="tocDialog" aria-label="目次">
        <aside class="drawer">
          <h2>目次</h2>
          <nav id="tocList"></nav>
        </aside>
      </dialog>

    <div class="loading" id="loading">ページを再計算しています…</div>

    <dialog class="image-viewer" id="imageViewer" aria-label="画像拡大表示">
      <button class="image-viewer__close" id="imageViewerClose" type="button" aria-label="画像を閉じる">×</button>
      <div class="image-viewer__viewport" id="imageViewerViewport">
        <img class="image-viewer__image" id="imageViewerImage" alt="" draggable="false" />
      </div>
    </dialog>

    <div class="measure-host" aria-hidden="true">
      <article class="measure-page" id="measurePage">
        <div class="measure-body" id="measureBody"></div>
      </article>
    </div>
  `;

    const STORAGE = {
        currentPage: `reader-current-page:${new URL(".", location.href).pathname}`,
        fontSize: "reader-font-size"
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const storage = {
        getNumber(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                if (raw == null) return fallback;

                const value = Number(raw);
                return Number.isFinite(value) ? value : fallback;
            } catch {
                return fallback;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, String(value));
            } catch {
                // Some local/content URI environments can block localStorage.
            }
        }
    };

    const savedFontSize = storage.getNumber(
        STORAGE.fontSize,
        CONFIG.font.defaultSize
    );
    const savedCurrentPage = storage.getNumber(STORAGE.currentPage, 0);

    const state = {
        pages: [],
        chapterStarts: [],
        currentPage: savedCurrentPage,
        fontSize: CONFIG.font.sizes.includes(savedFontSize)
            ? savedFontSize
            : CONFIG.font.defaultSize,
        mode: "normal"
    };

    const imageDimensions = new Map();

    const readerInteraction = {
        pointer: null,
        dragging: false,
        isTurning: false
    };

    const overviewInteraction = {
        dirty: true,
        step: null,
        scrollRaf: 0
    };

    let modeTransitioning = false;
    let resizeTimer = null;
    let readerResizeObserver = null;

    const els = {
        readerShell: document.getElementById("readerShell"),
        topbarTitle: document.getElementById("topbarTitle"),
        currentPage: document.getElementById("currentPage"),
        prevPage: document.getElementById("prevPage"),
        nextPage: document.getElementById("nextPage"),
        overviewScroller: document.getElementById("overviewScroller"),
        overviewStrip: document.getElementById("overviewStrip"),
        pageSlider: document.getElementById("pageSlider"),
        pageCounter: document.getElementById("pageCounter"),
        displayPopover: document.getElementById("displayPopover"),
        overviewButton: document.getElementById("overviewButton"),
        fontButtons: [...document.querySelectorAll(".font-button")],
        tocOpenButton: document.getElementById("tocOpenButton"),
        tocDialog: document.getElementById("tocDialog"),
        tocList: document.getElementById("tocList"),
        loading: document.getElementById("loading"),
        measurePage: document.getElementById("measurePage"),
        measureBody: document.getElementById("measureBody"),
        imageViewer: document.getElementById("imageViewer"),
        imageViewerViewport: document.getElementById("imageViewerViewport"),
        imageViewerImage: document.getElementById("imageViewerImage"),
        imageViewerClose: document.getElementById("imageViewerClose")
    };

    const stage = document.querySelector(".stage");

    const imageViewerGesture = {
        scale: 1,
        x: 0,
        y: 0,
        pointers: new Map(),
        panStart: null,
        pinchStart: null
    };

    function constrainImageViewerPan() {
        const width = els.imageViewerImage.offsetWidth * imageViewerGesture.scale;
        const height = els.imageViewerImage.offsetHeight * imageViewerGesture.scale;
        const maxX = Math.max(0, (width - els.imageViewerViewport.clientWidth) / 2);
        const maxY = Math.max(0, (height - els.imageViewerViewport.clientHeight) / 2);

        imageViewerGesture.x = clamp(imageViewerGesture.x, -maxX, maxX);
        imageViewerGesture.y = clamp(imageViewerGesture.y, -maxY, maxY);
    }

    function applyImageViewerTransform() {
        constrainImageViewerPan();
        els.imageViewerImage.style.transform =
            `translate3d(${imageViewerGesture.x}px, ${imageViewerGesture.y}px, 0) ` +
            `scale(${imageViewerGesture.scale})`;
    }

    function resetImageViewerTransform() {
        imageViewerGesture.scale = 1;
        imageViewerGesture.x = 0;
        imageViewerGesture.y = 0;
        imageViewerGesture.pointers.clear();
        imageViewerGesture.panStart = null;
        imageViewerGesture.pinchStart = null;
        applyImageViewerTransform();
    }

    function openImageViewer(sourceImage) {
        closeDisplayPopover();
        closeToc();

        els.imageViewerImage.src = sourceImage.currentSrc || sourceImage.src;
        els.imageViewerImage.alt = sourceImage.alt || "";
        resetImageViewerTransform();

        if (!els.imageViewer.open) {
            els.imageViewer.showModal();
        }
        els.imageViewerClose.focus({ preventScroll: true });
    }

    function closeImageViewer() {
        if (els.imageViewer.open) {
            els.imageViewer.close();
        }
    }

    function getReaderImage(target) {
        if (!(target instanceof Element)) return null;

        const block = target.closest(".book-image-block");
        if (!block?.closest(".stage")) return null;

        return block.querySelector("img");
    }

    function imageViewerDistance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function startImageViewerPinch() {
        const points = [...imageViewerGesture.pointers.values()];
        if (points.length < 2) return;

        imageViewerGesture.pinchStart = {
            distance: Math.max(1, imageViewerDistance(points[0], points[1])),
            scale: imageViewerGesture.scale
        };
    }

    function endImageViewerPointer(event) {
        if (!imageViewerGesture.pointers.has(event.pointerId)) return;

        imageViewerGesture.pointers.delete(event.pointerId);
        imageViewerGesture.pinchStart = null;

        if (imageViewerGesture.pointers.size === 1) {
            const point = [...imageViewerGesture.pointers.values()][0];
            imageViewerGesture.panStart = {
                pointerX: point.x,
                pointerY: point.y,
                x: imageViewerGesture.x,
                y: imageViewerGesture.y
            };
        } else {
            imageViewerGesture.panStart = null;
        }

        try {
            els.imageViewerViewport.releasePointerCapture(event.pointerId);
        } catch (_) { }
    }

    els.imageViewer.addEventListener("close", resetImageViewerTransform);
    els.imageViewerClose.addEventListener("click", closeImageViewer);

    els.imageViewerViewport.addEventListener("click", (event) => {
        if (event.target === els.imageViewerViewport) {
            closeImageViewer();
        }
    });

    els.imageViewerViewport.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;

        imageViewerGesture.pointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY
        });

        try {
            els.imageViewerViewport.setPointerCapture(event.pointerId);
        } catch (_) { }

        if (imageViewerGesture.pointers.size === 1) {
            imageViewerGesture.panStart = {
                pointerX: event.clientX,
                pointerY: event.clientY,
                x: imageViewerGesture.x,
                y: imageViewerGesture.y
            };
        } else if (imageViewerGesture.pointers.size === 2) {
            startImageViewerPinch();
        }

        event.preventDefault();
    });

    els.imageViewerViewport.addEventListener("pointermove", (event) => {
        if (!imageViewerGesture.pointers.has(event.pointerId)) return;

        imageViewerGesture.pointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY
        });

        if (imageViewerGesture.pointers.size >= 2) {
            if (!imageViewerGesture.pinchStart) {
                startImageViewerPinch();
            }

            const points = [...imageViewerGesture.pointers.values()];
            const distance = Math.max(1, imageViewerDistance(points[0], points[1]));
            const start = imageViewerGesture.pinchStart;

            imageViewerGesture.scale = clamp(
                start.scale * distance / start.distance,
                1,
                4
            );

            if (imageViewerGesture.scale === 1) {
                imageViewerGesture.x = 0;
                imageViewerGesture.y = 0;
            }

            applyImageViewerTransform();
            event.preventDefault();
            return;
        }

        if (
            imageViewerGesture.scale > 1 &&
            imageViewerGesture.panStart
        ) {
            imageViewerGesture.x =
                imageViewerGesture.panStart.x +
                event.clientX -
                imageViewerGesture.panStart.pointerX;
            imageViewerGesture.y =
                imageViewerGesture.panStart.y +
                event.clientY -
                imageViewerGesture.panStart.pointerY;
            applyImageViewerTransform();
        }

        event.preventDefault();
    });

    els.imageViewerViewport.addEventListener("pointerup", endImageViewerPointer);
    els.imageViewerViewport.addEventListener("pointercancel", endImageViewerPointer);

    function createTextElement(tag, text, className = "") {
        const element = document.createElement(tag);
        element.textContent = text;
        if (className) element.className = className;
        return element;
    }

    function wrapInlineNode(node, marks = []) {
        let wrapped = node;

        [...marks].reverse().forEach((mark) => {
            const wrapper = document.createElement(mark === "strong" ? "strong" : "small");
            wrapper.appendChild(wrapped);
            wrapped = wrapper;
        });

        return wrapped;
    }

    function appendInlineSegments(parent, segments) {
        segments.forEach((segment) => {
            if (segment.type === "break") {
                parent.appendChild(document.createElement("br"));
                return;
            }

            if (segment.type === "footnote-ref") {
                const reference = document.createElement("sup");
                reference.className = "footnote-ref";
                reference.textContent = segment.label;
                reference.setAttribute("aria-label", `注釈 ${segment.label}`);
                parent.appendChild(reference);
                return;
            }

            if (segment.type === "text") {
                const textNode = document.createTextNode(segment.text);
                parent.appendChild(wrapInlineNode(textNode, segment.marks));
            }
        });
    }

    function createInlineElement(tag, segments, className = "") {
        const element = document.createElement(tag);
        if (className) element.className = className;
        appendInlineSegments(element, segments);
        return element;
    }

    function createHeading(level, segments) {
        return createInlineElement(`h${level}`, segments);
    }

    function createParagraph(segments, continuation = false, classes = []) {
        const paragraph = document.createElement("p");
        paragraph.className = [
            continuation ? "continuation" : "",
            ...classes
        ].filter(Boolean).join(" ");
        appendInlineSegments(paragraph, segments);
        return paragraph;
    }

    function createList(block, items = block.items, start = block.start ?? 1, continuation = false) {
        const list = document.createElement(block.ordered ? "ol" : "ul");
        list.className = continuation
            ? "book-list book-list--continuation"
            : "book-list";

        if (block.ordered && start !== 1) {
            list.start = start;
        }

        items.forEach((itemData) => {
            const item = document.createElement("li");
            appendInlineSegments(item, itemData.inline);
            list.appendChild(item);
        });

        return list;
    }

    function createFootnotes(items, continuation = false) {
        const list = document.createElement("ul");
        list.className = continuation
            ? "book-footnotes book-footnotes--continuation"
            : "book-footnotes";

        items.forEach((itemData) => {
            const item = document.createElement("li");

            if (!continuation) {
                const label = document.createElement("span");
                label.className = "book-footnote-label";
                label.textContent = `${itemData.label}　`;
                item.appendChild(label);
            }

            appendInlineSegments(item, itemData.inline);
            list.appendChild(item);
        });

        return list;
    }

    function createImageBlock(block) {
        const figure = document.createElement("figure");
        figure.className = "book-image-block";

        const frame = document.createElement("div");
        frame.className = "book-image-frame";

        const img = document.createElement("img");
        const dimensions = imageDimensions.get(block.src);
        if (dimensions) {
            img.width = dimensions.width;
            img.height = dimensions.height;
        }
        img.src = block.src;
        img.alt = block.alt || "";
        img.draggable = false;
        frame.appendChild(img);

        const zoomIcon = document.createElement("span");
        zoomIcon.className = "book-image-zoom-icon";
        zoomIcon.setAttribute("aria-hidden", "true");
        zoomIcon.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M7 14H5v5h5v-2H7v-3Zm-2-4h2V7h3V5H5v5Zm12 7h-3v2h5v-5h-2v3Zm-3-12v2h3v3h2V5h-5Z"/>
            </svg>
        `;
        frame.appendChild(zoomIcon);

        figure.appendChild(frame);

        if (block.alt) {
            figure.appendChild(
                createTextElement(
                    "figcaption",
                    block.alt,
                    "book-image-caption"
                )
            );
        }

        return figure;
    }

    function applyImageBlockScale(figure, scale, baseFrameWidth, baseImageHeight) {
        const frame = figure.querySelector(".book-image-frame");
        const image = frame?.querySelector("img");
        if (!frame || !image) return;

        frame.style.width = `${(baseFrameWidth * scale).toFixed(1)}px`;
        image.style.height = `${(baseImageHeight * scale).toFixed(1)}px`;
    }

    function resetImageBlockScale(figure) {
        const frame = figure.querySelector(".book-image-frame");
        const image = frame?.querySelector("img");
        if (!frame || !image) return;

        frame.style.removeProperty("width");
        image.style.removeProperty("height");
    }

    function fitsImageBlock(figure) {
        const bodyRect = els.measureBody.getBoundingClientRect();
        const figureRect = figure.getBoundingClientRect();

        return figureRect.bottom <= bodyRect.bottom + 0.5;
    }

    function fitImageBlockToCurrentPage(figure, minScale = 0.65) {
        const frame = figure.querySelector(".book-image-frame");
        const image = frame?.querySelector("img");
        if (!frame || !image) return false;

        const bodyRect = els.measureBody.getBoundingClientRect();
        const figureRect = figure.getBoundingClientRect();
        const frameRect = frame.getBoundingClientRect();
        const imageRect = image.getBoundingClientRect();

        if (frameRect.width <= 0 || imageRect.height <= 0) return false;

        const trailingHeight = Math.max(
            0,
            figureRect.bottom - frameRect.bottom
        );
        let scale = clamp(
            (
                bodyRect.bottom -
                frameRect.top -
                trailingHeight -
                1
            ) / imageRect.height,
            0,
            1
        );

        for (let attempt = 0; attempt < 4; attempt += 1) {
            if (scale < minScale) {
                resetImageBlockScale(figure);
                return false;
            }

            applyImageBlockScale(
                figure,
                scale,
                frameRect.width,
                imageRect.height
            );

            if (fitsImageBlock(figure)) return true;

            const overflow = Math.max(
                0,
                figure.getBoundingClientRect().bottom - bodyRect.bottom
            );
            scale = clamp(
                scale - (overflow + 1) / imageRect.height,
                0,
                1
            );
        }

        resetImageBlockScale(figure);
        return false;
    }

    function moveBlockToNewPage(node, chapterIndex) {
        node.remove();
        commitMeasuredPage(chapterIndex);
        els.measureBody.appendChild(node);
    }

    function isTrailingHeading(element) {
        return element?.matches("h1, h2, h3") ?? false;
    }

    function moveTrailingHeadingToNewPage(chapterIndex) {
        const heading = els.measureBody.lastElementChild;
        if (!isTrailingHeading(heading)) return false;

        moveBlockToNewPage(heading, chapterIndex);
        return true;
    }

    function paginateImageBlock(block, chapterIndex) {
        const node = createImageBlock(block);
        els.measureBody.appendChild(node);

        if (fitsImageBlock(node)) return;
        if (fitImageBlockToCurrentPage(node)) return;

        moveBlockToNewPage(node, chapterIndex);
    }

    function appendFullImagePage(block, chapterIndex) {
        commitMeasuredPage(chapterIndex);

        const image = document.createElement("img");
        image.className = "full-page-image";
        image.src = block.src;
        image.alt = block.alt || "";

        state.pages.push({
            bodyHTML: image.outerHTML,
            chapterIndex,
            type: "full-image"
        });
    }

    function fitsMeasureBody() {
        return els.measureBody.scrollHeight <= els.measureBody.clientHeight + 0.5;
    }

    function commitMeasuredPage(chapterIndex = 0, type = "text") {
        const html = els.measureBody.innerHTML.trim();
        if (!html) return;

        state.pages.push({
            bodyHTML: html,
            chapterIndex,
            type
        });

        els.measureBody.innerHTML = "";
    }

    function findLargestFittingInlinePrefix(segments, createNode) {
        let low = 1;
        let high = inlineLength(segments);
        let best = 0;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const node = createNode(sliceInlineSegments(segments, 0, mid));
            els.measureBody.appendChild(node);

            const fits = fitsMeasureBody();
            node.remove();

            if (fits) {
                best = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return best;
    }

    function paginateParagraph(block, chapterIndex) {
        let remaining = block.inline;
        let continuation = false;

        while (inlineLength(remaining) > 0) {
            const fullNode = createParagraph(
                remaining,
                continuation,
                block.classes
            );
            els.measureBody.appendChild(fullNode);

            if (fitsMeasureBody()) return;

            fullNode.remove();

            const fittingLength = findLargestFittingInlinePrefix(
                remaining,
                (segments) => createParagraph(
                    segments,
                    continuation,
                    block.classes
                )
            );

            if (fittingLength === 0) {
                if (moveTrailingHeadingToNewPage(chapterIndex)) continue;
                commitMeasuredPage(chapterIndex);
                continue;
            }

            els.measureBody.appendChild(
                createParagraph(
                    sliceInlineSegments(remaining, 0, fittingLength),
                    continuation,
                    block.classes
                )
            );
            commitMeasuredPage(chapterIndex);

            remaining = dropInlineSegments(remaining, fittingLength);
            continuation = true;
        }
    }

    function paginateOversizedInlineItem({
        itemData,
        chapterIndex,
        createNode,
        protectTrailingHeading = false
    }) {
        let remaining = itemData.inline;
        let continuation = false;

        while (inlineLength(remaining) > 0) {
            const fullNode = createNode(remaining, continuation);
            els.measureBody.appendChild(fullNode);

            if (fitsMeasureBody()) return;
            fullNode.remove();

            const fittingLength = findLargestFittingInlinePrefix(
                remaining,
                (segments) => createNode(segments, continuation)
            );

            if (fittingLength === 0) {
                if (
                    protectTrailingHeading &&
                    moveTrailingHeadingToNewPage(chapterIndex)
                ) {
                    continue;
                }

                if (els.measureBody.innerHTML.trim()) {
                    commitMeasuredPage(chapterIndex);
                    continue;
                }

                const fallback = sliceInlineSegments(remaining, 0, 1);
                els.measureBody.appendChild(
                    createNode(fallback, continuation)
                );
                commitMeasuredPage(chapterIndex);
                remaining = dropInlineSegments(remaining, 1);
                continuation = true;
                continue;
            }

            els.measureBody.appendChild(
                createNode(
                    sliceInlineSegments(remaining, 0, fittingLength),
                    continuation
                )
            );
            commitMeasuredPage(chapterIndex);
            remaining = dropInlineSegments(remaining, fittingLength);
            continuation = true;
        }
    }

    function paginateItemCollection({
        items,
        chapterIndex,
        createContainer,
        appendItem,
        paginateOversized
    }) {
        let index = 0;

        while (index < items.length) {
            const container = createContainer(index);
            els.measureBody.appendChild(container);
            let addedItems = 0;

            while (index < items.length) {
                const item = appendItem(container, items[index], index);

                if (!fitsMeasureBody()) {
                    item.remove();
                    break;
                }

                index += 1;
                addedItems += 1;
            }

            if (index >= items.length) return;

            if (addedItems > 0) {
                commitMeasuredPage(chapterIndex);
                continue;
            }

            container.remove();

            if (els.measureBody.innerHTML.trim()) {
                commitMeasuredPage(chapterIndex);
                continue;
            }

            paginateOversized(items[index], index);
            index += 1;
        }
    }

    function paginateOversizedListItem(block, itemData, start, chapterIndex) {
        paginateOversizedInlineItem({
            itemData,
            chapterIndex,
            protectTrailingHeading: true,
            createNode: (segments, continuation) => createList(
                block,
                [{ ...itemData, inline: segments }],
                start,
                continuation
            )
        });
    }

    function paginateList(block, chapterIndex) {
        paginateItemCollection({
            items: block.items,
            chapterIndex,
            createContainer: (index) => createList(
                block,
                [],
                (block.start ?? 1) + index
            ),
            appendItem: (list, itemData) => {
                const item = document.createElement("li");
                appendInlineSegments(item, itemData.inline);
                list.appendChild(item);
                return item;
            },
            paginateOversized: (itemData, index) => {
                paginateOversizedListItem(
                    block,
                    itemData,
                    (block.start ?? 1) + index,
                    chapterIndex
                );
            }
        });
    }

    function paginateOversizedFootnote(itemData, chapterIndex) {
        paginateOversizedInlineItem({
            itemData,
            chapterIndex,
            createNode: (segments, continuation) => createFootnotes(
                [{ ...itemData, inline: segments }],
                continuation
            )
        });
    }

    function paginateFootnotes(block, chapterIndex) {
        paginateItemCollection({
            items: block.items,
            chapterIndex,
            createContainer: () => createFootnotes([]),
            appendItem: (list, itemData) => {
                const item = document.createElement("li");

                const label = document.createElement("span");
                label.className = "book-footnote-label";
                label.textContent = `${itemData.label}　`;
                item.appendChild(label);

                appendInlineSegments(item, itemData.inline);
                list.appendChild(item);
                return item;
            },
            paginateOversized: (itemData) => {
                paginateOversizedFootnote(itemData, chapterIndex);
            }
        });
    }

    function createColophonSection() {
        const section = document.createElement("section");
        section.className = "colophon";
        return section;
    }

    function getColophonBlocks() {
        const textBlocks = (lines) => lines.map((text) => ({
            text,
            className: "colophon__text"
        }));

        return [
            { text: book.title, className: "colophon__title" },
            { text: "【発行日】", className: "colophon__label" },
            { text: book.published, className: "colophon__text" },
            { text: "【発行元】", className: "colophon__label" },
            ...textBlocks(COLOPHON.publisher),
            ...textBlocks(COLOPHON.copyright),
            { text: "【注意】", className: "colophon__label" },
            ...textBlocks(COLOPHON.notice)
        ];
    }

    function paginateColophon() {
        const chapterIndex = book.chapters.length - 1;
        let section = createColophonSection();
        els.measureBody.appendChild(section);

        const startNewPage = () => {
            commitMeasuredPage(chapterIndex, "colophon");
            section = createColophonSection();
            els.measureBody.appendChild(section);
        };

        getColophonBlocks().forEach(({ text, className }) => {
            const element = createTextElement("p", text, className);
            section.appendChild(element);

            if (fitsMeasureBody()) return;

            element.remove();
            startNewPage();
            section.appendChild(element);
        });

        commitMeasuredPage(chapterIndex, "colophon");
    }

    function paginateHeading(level, segments, chapterIndex) {
        const node = createHeading(level, segments);
        els.measureBody.appendChild(node);

        if (!fitsMeasureBody()) {
            moveBlockToNewPage(node, chapterIndex);
        }
    }

    function paginateBookBlock(block, chapterIndex) {
        switch (block.type) {
            case "image":
                paginateImageBlock(block, chapterIndex);
                break;
            case "h2":
                paginateHeading(2, block.inline, chapterIndex);
                break;
            case "h3":
                paginateHeading(3, block.inline, chapterIndex);
                break;
            case "paragraph":
                paginateParagraph(block, chapterIndex);
                break;
            case "list":
                paginateList(block, chapterIndex);
                break;
            case "footnotes":
                paginateFootnotes(block, chapterIndex);
                break;
            default:
                console.warn(`Unsupported book block type: ${block.type}`);
        }
    }

    function paginateBook() {
        state.pages = [];
        state.chapterStarts = [];
        els.measureBody.innerHTML = "";

        state.pages.push({
            bodyHTML: `<img class="cover-image" src="${book.cover.src}" alt="${book.cover.alt}">`,
            chapterIndex: -1,
            type: "cover"
        });

        book.chapters.forEach((chapter, chapterIndex) => {
            state.chapterStarts[chapterIndex] = state.pages.length;
            let headingPending = true;

            const ensureChapterHeading = () => {
                if (!headingPending) return;

                els.measureBody.appendChild(
                    createHeading(1, chapter.titleInline)
                );
                headingPending = false;
            };

            chapter.blocks.forEach((block) => {
                if (block.type === "full-image") {
                    appendFullImagePage(block, chapterIndex);
                    return;
                }

                ensureChapterHeading();

                paginateBookBlock(block, chapterIndex);
            });

            ensureChapterHeading();
            commitMeasuredPage(chapterIndex);
        });

        paginateColophon();
    }

    function renderPageCard(target, pageIndex) {
        if (pageIndex < 0 || pageIndex >= state.pages.length) {
            target.classList.add("is-empty");
            target.classList.remove(
                "cover-card",
                "full-image-card",
                "colophon-card"
            );
            target.innerHTML = "";
            return;
        }

        const page = state.pages[pageIndex];
        target.classList.remove("is-empty");
        target.classList.toggle("cover-card", page.type === "cover");
        target.classList.toggle("full-image-card", page.type === "full-image");
        target.classList.toggle("colophon-card", page.type === "colophon");
        target.innerHTML = `<div class="page-body">${page.bodyHTML}</div>`;
    }

    function currentChapterTitle() {
        const page = state.pages[state.currentPage];

        if (!page) return book.title;
        if (page.type === "cover") return book.title;
        if (page.type === "colophon") return "";

        const index = page.chapterIndex ?? 0;
        return book.chapters[index]?.titleText ?? book.title;
    }

    function updateTocHighlight() {
        const page = state.pages[state.currentPage];
        const chapterIndex = page?.type === "cover" ? -1 : (page?.chapterIndex ?? 0);

        els.tocList.querySelectorAll(".toc-button").forEach((button, index) => {
            button.classList.toggle("active", index === chapterIndex);
        });
    }

    function clampPageIndex(index) {
        return clamp(index, 0, Math.max(0, state.pages.length - 1));
    }

    function configurePageSlider() {
        els.pageSlider.max = String(Math.max(1, state.pages.length));
    }

    function updateFontButtons() {
        els.fontButtons.forEach((button) => {
            button.setAttribute(
                "aria-pressed",
                String(Number(button.dataset.fontSize) === state.fontSize)
            );
        });
    }

    function updateReadingPositionUI() {
        const readingPage =
            state.mode === "normal" &&
            isSpreadView() &&
            state.currentPage > 0
                ? Math.min(
                    getSpreadStart(state.currentPage) + 1,
                    state.pages.length - 1
                )
                : state.currentPage;

        els.pageSlider.value = String(readingPage + 1);
        els.pageCounter.textContent = `${readingPage + 1}/${state.pages.length}`;
        els.topbarTitle.textContent = currentChapterTitle();
        updateTocHighlight();
        storage.set(STORAGE.currentPage, state.currentPage);
    }

    function setCurrentPage(index, { render = false, syncUI = true } = {}) {
        state.currentPage = clampPageIndex(index);

        if (render) {
            renderPageStack();
        }

        if (syncUI) {
            updateReadingPositionUI();
        }
    }

    function isSpreadView() {
        const viewportWidth = document.documentElement.clientWidth;
        return viewportWidth > 0 && els.measurePage.offsetWidth < viewportWidth;
    }

    function getSpreadStart(index) {
        const page = clampPageIndex(index);
        if (page === 0) return 0;
        return page % 2 === 0 ? page - 1 : page;
    }

    function renderPageStack() {
        if (isSpreadView()) {
            const start = getSpreadStart(state.currentPage);

            resetStackTurn();
            renderPageCard(els.currentPage, start);
            renderPageCard(els.prevPage, -1);
            renderPageCard(
                els.nextPage,
                start === 0 ? -1 : start + 1
            );
            return;
        }

        renderPageCard(els.currentPage, state.currentPage);
        renderPageCard(els.prevPage, state.currentPage - 1);
        renderPageCard(els.nextPage, state.currentPage + 1);
    }

    function updateOverviewGeometry() {
        const width = els.measurePage.offsetWidth;
        const height = els.measurePage.offsetHeight;

        const widthScale =
            (width - CONFIG.overview.horizontalReserve) / width;
        const heightScale =
            (height - CONFIG.overview.verticalReserve) / height;

        const scale = clamp(
            Math.min(widthScale, heightScale),
            CONFIG.overview.minScale,
            CONFIG.overview.maxScale
        );

        const itemWidth = width * scale;
        const itemHeight = height * scale;
        const overviewViewportWidth = els.overviewScroller.clientWidth;

        const sidePad = Math.max(
            0,
            (overviewViewportWidth - itemWidth) / 2
        );

        document.documentElement.style.setProperty(
            "--overview-scale",
            scale.toFixed(4)
        );
        document.documentElement.style.setProperty(
            "--overview-item-width",
            `${itemWidth.toFixed(1)}px`
        );
        document.documentElement.style.setProperty(
            "--overview-item-height",
            `${itemHeight.toFixed(1)}px`
        );
        document.documentElement.style.setProperty(
            "--overview-side-pad",
            `${sidePad.toFixed(1)}px`
        );

        overviewInteraction.step = null;
    }

    function renderOverviewStrip() {
        const fragment = document.createDocumentFragment();

        state.pages.forEach((_, index) => {
            const item = document.createElement("div");
            item.className = "overview-item";
            item.dataset.index = String(index);

            const card = document.createElement("article");
            card.className = "page-card";
            renderPageCard(card, index);

            item.appendChild(card);
            fragment.appendChild(item);
        });

        els.overviewStrip.replaceChildren(fragment);
    }

    function getOverviewStep() {
        if (overviewInteraction.step != null) {
            return overviewInteraction.step;
        }

        const first = els.overviewStrip.children[0];
        if (!first) return null;

        const second = els.overviewStrip.children[1];
        overviewInteraction.step = second
            ? second.offsetLeft - first.offsetLeft
            : first.offsetWidth;

        return overviewInteraction.step;
    }

    function getOverviewScrollLeftForPage(index) {
        const step = getOverviewStep();
        if (step == null) return null;

        return clampPageIndex(index) * step;
    }

    function scrollOverviewToPage(index, behavior = "auto") {
        const left = getOverviewScrollLeftForPage(index);
        if (left == null) return;

        els.overviewScroller.scrollTo({ left, behavior });
    }

    function syncPageFromOverviewScroll() {
        cancelAnimationFrame(overviewInteraction.scrollRaf);

        overviewInteraction.scrollRaf = requestAnimationFrame(() => {
            const step = getOverviewStep();
            if (!step || step <= 0) return;

            const maxScroll = Math.max(
                0,
                els.overviewScroller.scrollWidth - els.overviewScroller.clientWidth
            );
            const progress = maxScroll > 0
                ? els.overviewScroller.scrollLeft / maxScroll
                : 0;
            const sliderMax = Math.max(1, state.pages.length);
            const sliderValue = 1 + progress * Math.max(0, sliderMax - 1);

            const index = clampPageIndex(
                Math.round(els.overviewScroller.scrollLeft / step)
            );

            if (index !== state.currentPage) {
                setCurrentPage(index);
            }

            els.pageSlider.value = String(sliderValue);
        });
    }

    function markOverviewDirty() {
        overviewInteraction.dirty = true;
        overviewInteraction.step = null;
    }

    function ensureOverviewStrip() {
        if (!overviewInteraction.dirty) return;

        renderOverviewStrip();
        overviewInteraction.dirty = false;
    }

    function nextPaint() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
    }

    function updateOverviewButton() {
        const active = state.mode === "overview";

        els.overviewButton.classList.toggle("is-active", active);
        els.overviewButton.setAttribute(
            "aria-label",
            active ? "通常表示に戻る" : "俯瞰表示"
        );
        els.overviewButton.setAttribute(
            "title",
            active ? "通常表示に戻る" : "俯瞰表示"
        );
    }

    function applyAppMode(mode) {
        state.mode = mode;
        document.body.classList.toggle("overview", mode === "overview");
        updateOverviewButton();
        updateReadingPositionUI();
    }

    function closeOverlays() {
        closeDisplayPopover();
        closeToc();
    }

    async function fadeModeChange(changeMode) {
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        if (reducedMotion || !els.readerShell.animate) {
            changeMode();
            return;
        }

        const options = {
            duration: CONFIG.overview.fadeDuration,
            easing: "ease",
            fill: "forwards"
        };

        const fadeOut = els.readerShell.animate(
            [{ opacity: 1 }, { opacity: 0 }],
            options
        );
        await fadeOut.finished.catch(() => { });

        changeMode();

        const fadeIn = els.readerShell.animate(
            [{ opacity: 0 }, { opacity: 1 }],
            options
        );
        await fadeIn.finished.catch(() => { });

        fadeOut.cancel();
        fadeIn.cancel();
    }

    async function setMode(mode) {
        if (mode === state.mode || modeTransitioning) return;

        closeOverlays();
        modeTransitioning = true;

        const changeMode = () => {
            if (mode === "overview") {
                ensureOverviewStrip();
                updateOverviewGeometry();
                scrollOverviewToPage(state.currentPage, "auto");
            } else {
                renderPageStack();
            }
            applyAppMode(mode);
        };

        try {
            await fadeModeChange(changeMode);
        } finally {
            modeTransitioning = false;
        }
    }

    function buildToc() {
        const fragment = document.createDocumentFragment();

        book.chapters.forEach((chapter, index) => {
            const button = document.createElement("button");
            button.className = "toc-button";
            button.dataset.chapterIndex = String(index);
            button.textContent = chapter.titleText ?? chapter.title;
            fragment.appendChild(button);
        });

        els.tocList.replaceChildren(fragment);
    }

    function setFontCss(size, { visible = true, measure = true } = {}) {
        if (visible) {
            document.documentElement.style.setProperty(
                "--reader-font-size",
                `${size}px`
            );
        }

        if (measure) {
            document.documentElement.style.setProperty(
                "--measure-font-size",
                `${size}px`
            );
        }
    }

    function refreshOverviewAfterPagination() {
        markOverviewDirty();

        if (state.mode !== "overview") return;

        ensureOverviewStrip();
        requestAnimationFrame(() => {
            scrollOverviewToPage(state.currentPage, "auto");
        });
    }

    function repaginate(reason) {
        const fontChange = reason === "font";
        const resize = reason === "resize";
        const pageCount = Math.max(state.pages.length, 1);
        const currentPage = state.pages[state.currentPage];
        const chapterIndex =
            fontChange &&
            Number.isInteger(currentPage?.chapterIndex) &&
            state.chapterStarts[currentPage.chapterIndex] === state.currentPage
                ? currentPage.chapterIndex
                : null;
        const progress = pageCount <= 1
            ? 0
            : state.currentPage / (pageCount - 1);

        if (fontChange) {
            setFontCss(state.fontSize, { visible: false, measure: true });
        } else {
            setFontCss(state.fontSize);
        }

        if (resize) {
            els.loading.hidden = false;
        }

        requestAnimationFrame(() => {
            paginateBook();
            configurePageSlider();

            const chapterPage = Number.isInteger(chapterIndex)
                ? state.chapterStarts[chapterIndex]
                : null;
            const nextPage = Number.isInteger(chapterPage)
                ? chapterPage
                : Math.round(
                    progress * Math.max(0, state.pages.length - 1)
                );

            setCurrentPage(nextPage, { syncUI: false });

            if (fontChange) {
                setFontCss(state.fontSize, { visible: true, measure: false });
            }

            renderPageStack();
            updateReadingPositionUI();
            refreshOverviewAfterPagination();

            if (resize) {
                els.loading.hidden = true;
            }
        });
    }

    function setFontSize(size, { repaginate: shouldRepaginate = true } = {}) {
        if (!CONFIG.font.sizes.includes(size)) return;
        if (shouldRepaginate && size === state.fontSize) return;

        state.fontSize = size;
        updateFontButtons();
        storage.set(STORAGE.fontSize, size);

        if (!shouldRepaginate) {
            setFontCss(size);
            return;
        }

        repaginate("font");
    }

    function closeDisplayPopover() {
        els.displayPopover.togglePopover(false);
    }

    function closeToc() {
        if (els.tocDialog.open) {
            els.tocDialog.close();
        }
    }

    function setTurnShadow(progress) {
        stage.style.setProperty(
            "--turn-shadow-opacity",
            String(clamp(progress * 1.25, 0, 1))
        );
    }

    function setDragX(px) {
        stage.style.setProperty("--drag-x", `${px}px`);

        setTurnShadow(
            Math.abs(px) /
            Math.max(1, window.innerWidth)
        );
    }

    function setReturnX(px) {
        stage.style.setProperty("--return-x", `${px}px`);

        setTurnShadow(
            1 -
            Math.abs(px) /
            Math.max(1, window.innerWidth)
        );
    }

    function resetStackTurn() {
        stage.classList.remove("is-animating", "turn-prev");
        stage.style.setProperty("--drag-x", "0px");
        stage.style.setProperty("--return-x", "-100vw");
        stage.style.setProperty("--turn-shadow-opacity", "0");
    }

    function beginTurnAnimation() {
        readerInteraction.isTurning = true;
        stage.classList.add("is-animating");
    }

    function endTurnAnimation() {
        resetStackTurn();
        readerInteraction.isTurning = false;
        readerInteraction.dragging = false;
    }

    function finishTurn(delta) {
        if (readerInteraction.isTurning) return;

        const nextPage = state.currentPage + delta;

        if (nextPage < 0 || nextPage >= state.pages.length) {
            snapReaderBack();
            return;
        }

        beginTurnAnimation();

        if (delta > 0) {
            requestAnimationFrame(() => {
                setDragX(-window.innerWidth);
            });
        } else {
            stage.classList.add("turn-prev");
            requestAnimationFrame(() => {
                setReturnX(0);
            });
        }

        window.setTimeout(() => {
            setCurrentPage(nextPage, { render: true });
            endTurnAnimation();
        }, CONFIG.pageTurn.duration);
    }

    function snapReaderBack() {
        if (readerInteraction.isTurning) return;

        beginTurnAnimation();

        if (stage.classList.contains("turn-prev")) {
            requestAnimationFrame(() => {
                setReturnX(-window.innerWidth);
            });
        } else {
            requestAnimationFrame(() => {
                setDragX(0);
            });
        }

        window.setTimeout(() => {
            endTurnAnimation();
        }, CONFIG.pageTurn.duration);
    }

    function navigateSpread(delta) {
        const start = getSpreadStart(state.currentPage);
        const target = delta > 0
            ? start === 0 ? 1 : start + 2
            : start <= 1 ? 0 : start - 2;

        if (target < 0 || target >= state.pages.length) return;

        setCurrentPage(target, { render: true });
    }

    function navigateBy(delta) {
        if (state.mode === "normal") {
            if (isSpreadView()) {
                navigateSpread(delta);
            } else {
                finishTurn(delta);
            }
            return;
        }

        const target = clampPageIndex(state.currentPage + delta);
        setCurrentPage(target);
        scrollOverviewToPage(target, "smooth");
    }

    els.overviewStrip.addEventListener("click", (event) => {
        const item = event.target.closest(".overview-item");
        if (!item) return;

        const index = Number(item.dataset.index);
        if (!Number.isInteger(index)) return;

        setCurrentPage(index, { syncUI: false });
        setMode("normal");
    });

    els.tocList.addEventListener("click", (event) => {
        const button = event.target.closest(".toc-button");
        if (!button) return;

        const chapterIndex = Number(button.dataset.chapterIndex);
        if (!Number.isInteger(chapterIndex)) return;

        const targetPage = state.chapterStarts[chapterIndex] ?? 0;
        closeToc();

        if (state.mode === "normal") {
            setCurrentPage(targetPage, { render: true });
            return;
        }

        setCurrentPage(targetPage);

        if (isSpreadView()) {
            setMode("normal");
        } else {
            scrollOverviewToPage(targetPage, "smooth");
        }
    });

    function handleReaderTap(x) {
        const width = window.innerWidth;

        if (x < width * 0.32) {
            navigateBy(-1);
        } else if (x > width * 0.68) {
            navigateBy(1);
        }
    }

    function handleReaderPointerTap(pointer, x) {
        if (pointer.image) {
            openImageViewer(pointer.image);
            return;
        }

        handleReaderTap(x);
    }

    stage.addEventListener("pointerdown", (event) => {
        if (
            state.mode !== "normal" ||
            readerInteraction.isTurning ||
            modeTransitioning
        ) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;

        const spread = isSpreadView();
        readerInteraction.pointer = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            time: performance.now(),
            image: getReaderImage(event.target),
            spread
        };
        readerInteraction.dragging = false;

        if (!spread) {
            resetStackTurn();
        }

        try {
            stage.setPointerCapture(event.pointerId);
        } catch (_) { }
    });

    stage.addEventListener("pointermove", (event) => {
        const pointer = readerInteraction.pointer;

        if (
            state.mode !== "normal" ||
            readerInteraction.isTurning ||
            !pointer ||
            pointer.spread ||
            pointer.id !== event.pointerId
        ) {
            return;
        }

        let dx = event.clientX - pointer.x;
        const dy = event.clientY - pointer.y;

        if (!readerInteraction.dragging) {
            if (Math.abs(dx) < 7) return;

            if (Math.abs(dx) <= Math.abs(dy)) {
                return;
            }

            readerInteraction.dragging = true;
        }

        if (dx < 0) {
            stage.classList.remove("turn-prev");
            setDragX(
                state.currentPage === state.pages.length - 1 ? 0 : dx
            );
        } else {
            if (state.currentPage === 0) {
                stage.classList.remove("turn-prev");
                setDragX(0);
            } else {
                stage.classList.add("turn-prev");
                const returnX = -window.innerWidth + dx;
                setReturnX(Math.min(0, returnX));
            }
        }

        event.preventDefault();
    });

    function endReaderPointer(event) {
        const pointer = readerInteraction.pointer;
        if (!pointer || pointer.id !== event.pointerId) return;

        const rawDx = event.clientX - pointer.x;
        const totalTime = Math.max(
            1,
            performance.now() - pointer.time
        );
        const distance = Math.abs(rawDx);
        const speed = distance / totalTime;
        const threshold =
            window.innerWidth * CONFIG.pageTurn.thresholdRatio;

        readerInteraction.pointer = null;

        try {
            stage.releasePointerCapture(event.pointerId);
        } catch (_) { }

        if (pointer.spread || !readerInteraction.dragging) {
            handleReaderPointerTap(pointer, event.clientX);
            return;
        }

        const shouldTurn =
            distance > threshold ||
            (
                distance > CONFIG.pageTurn.flickDistance &&
                speed >= CONFIG.pageTurn.flickVelocity
            );

        if (shouldTurn) {
            finishTurn(rawDx < 0 ? 1 : -1);
        } else {
            snapReaderBack();
        }
    }

    function cancelReaderPointer(event) {
        const pointer = readerInteraction.pointer;
        if (!pointer || pointer.id !== event.pointerId) return;

        readerInteraction.pointer = null;

        try {
            stage.releasePointerCapture(event.pointerId);
        } catch (_) { }

        if (readerInteraction.dragging) {
            snapReaderBack();
        }
    }

    stage.addEventListener("pointerup", endReaderPointer);
    stage.addEventListener("pointercancel", cancelReaderPointer);

    els.overviewScroller.addEventListener(
        "scroll",
        syncPageFromOverviewScroll,
        { passive: true }
    );

    els.pageSlider.addEventListener("input", (event) => {
        const value = Number(event.target.value);

        if (state.mode === "overview") {
            const sliderMax = Math.max(1, state.pages.length);
            const progress = sliderMax > 1
                ? clamp((value - 1) / (sliderMax - 1), 0, 1)
                : 0;
            const maxScroll = Math.max(
                0,
                els.overviewScroller.scrollWidth - els.overviewScroller.clientWidth
            );

            els.overviewScroller.scrollLeft = progress * maxScroll;
            return;
        }

        setCurrentPage(Math.round(value) - 1, { render: true });
    });

    els.displayPopover.addEventListener("beforetoggle", (event) => {
        if (event.newState === "open") closeToc();
    });

    els.overviewButton.addEventListener("click", () => {
        setMode(state.mode === "overview" ? "normal" : "overview");
    });

    function scheduleRepagination() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            repaginate("resize");
        }, 160);
    }

    els.fontButtons.forEach((button) => {
        button.addEventListener("click", () => {
            setFontSize(Number(button.dataset.fontSize));
        });
    });

    els.tocOpenButton.addEventListener("click", () => {
        if (els.tocDialog.open) {
            closeToc();
        } else {
            closeDisplayPopover();
            els.tocDialog.showModal();
        }
    });

    els.tocDialog.addEventListener("click", (event) => {
        if (event.target === els.tocDialog) {
            closeToc();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (
            modeTransitioning ||
            readerInteraction.isTurning ||
            els.tocDialog.open ||
            els.imageViewer.open ||
            els.displayPopover.matches(":popover-open")
        ) return;

        if (event.key === "ArrowRight" || event.key === "PageDown") {
            event.preventDefault();
            navigateBy(1);
        }

        if (event.key === "ArrowLeft" || event.key === "PageUp") {
            event.preventDefault();
            navigateBy(-1);
        }

        if (event.key === " ") {
            event.preventDefault();
            if (state.mode === "normal") {
                navigateBy(1);
            } else {
                setMode("normal");
            }
        }

        if (event.key === "Escape" && state.mode === "overview") {
            setMode("normal");
        }
    });

    function startReaderResizeTracking() {
        let width = els.measureBody.clientWidth;
        let height = els.measureBody.clientHeight;

        readerResizeObserver = new ResizeObserver(() => {
            const nextWidth = els.measureBody.clientWidth;
            const nextHeight = els.measureBody.clientHeight;

            if (nextWidth === width && nextHeight === height) return;

            width = nextWidth;
            height = nextHeight;
            updateOverviewGeometry();
            scheduleRepagination();
        });
        readerResizeObserver.observe(els.measureBody);
    }

    function preloadBookImages() {
        const sources = new Set([
            book.cover.src,
            ...book.chapters.flatMap((chapter) =>
                chapter.blocks
                    .map((block) => block.src)
                    .filter(Boolean)
            )
        ].filter(Boolean));

        return Promise.all([...sources].map(async (src) => {
            const image = new Image();
            image.src = src;

            try {
                await image.decode();
            } catch (_) { }

            if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                imageDimensions.set(src, {
                    width: image.naturalWidth,
                    height: image.naturalHeight
                });
            }
        }));
    }

    async function init() {
        setFontSize(state.fontSize, { repaginate: false });

        await Promise.all([
            document.fonts.ready,
            preloadBookImages()
        ]);
        await nextPaint();

        paginateBook();
        buildToc();
        configurePageSlider();

        setCurrentPage(state.currentPage, { render: true });
        els.loading.hidden = true;
        startReaderResizeTracking();
    }

    init();
})();