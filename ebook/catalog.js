(() => {
    "use strict";

    const config = window.LIBRARY_CATALOG_CONFIG;

    if (!config?.books?.length) {
        console.error("LIBRARY_CATALOG_CONFIG が見つかりません。");
        return;
    }

    const state = {
        view: "ebook",

        items: {
            ebook: [],
            video: []
        },

        filters: {
            ebook: {
                theme: "すべて",
                sort: "recommended"
            },
            video: {
                theme: "すべて",
                sort: "recommended"
            }
        }
    };

    const els = {
        tabs: [...document.querySelectorAll("[data-catalog-tab]")],
        description: document.getElementById("catalogDescription"),
        grid: document.getElementById("catalogGrid"),
        status: document.getElementById("catalogStatus"),
        themeSelect: document.getElementById("themeSelect"),
        sortSelect: document.getElementById("sortSelect")
    };

    const VIEW_CONFIG = {
        ebook: {
            unit: "冊",
            emptyText: "該当するeBookはありません",
            description:
                "マンション投資をはじめとした不動産投資の情報から、投資や節税について気になる情報をeBookにまとめました。今後も続々公開予定です。お楽しみに。",
            createCard: createBookCard
        },
        video: {
            unit: "本",
            emptyText: "該当する動画セミナーはありません",
            description:
                "不動産投資や資産形成について、動画で学べるセミナーをYouTubeでご覧いただけます。",
            createCard: createVideoCard
        }
    };

    function extractMarkdownSource(source) {
        const match = source.match(
            /window\.bookMarkdown\s*=\s*`([\s\S]*?)`\s*;/
        );

        return match ? match[1] : "";
    }

    function parseFrontmatter(source) {
        const markdown = extractMarkdownSource(source);
        const match = markdown.match(
            /^\s*---\s*\n([\s\S]*?)\n---/
        );

        if (!match) {
            throw new Error("frontmatter が見つかりません。");
        }

        const meta = {};

        match[1].split("\n").forEach((line) => {
            const separator = line.indexOf(":");
            if (separator < 0) return;

            const key = line.slice(0, separator).trim();
            const value = line.slice(separator + 1).trim();
            meta[key] = value;
        });

        return {
            title: meta.title || "無題",
            cover: meta.cover || "",
            published: meta.published || "",
            description: meta.description || "",
            themes: parseThemes(meta.themes),
            href: meta.href || ""
        };
    }

    function parseThemes(value) {
        if (Array.isArray(value)) {
            return value.filter(Boolean);
        }

        return String(value || "")
            .split(",")
            .map((theme) => theme.trim())
            .filter(Boolean);
    }

    function resolveAssetUrl(bookId, value) {
        if (!value) return "";

        if (
            /^(?:https?:)?\/\//.test(value) ||
            value.startsWith("/")
        ) {
            return value;
        }

        return `/ebook/${bookId}/${value.replace(/^\.\//, "")}`;
    }

    function getBookHref(book) {
        return book.href || `/ebook/${book.id}/`;
    }

    function formatPublishedDate(value) {
        const match = String(value).match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

        if (!match) return value;

        const [, year, month, day] = match;
        return `${year}年${Number(month)}月${Number(day)}日`;
    }

    function getYoutubeId(value) {
        try {
            const url = new URL(value);

            if (url.hostname === "youtu.be") {
                return url.pathname
                    .split("/")
                    .filter(Boolean)[0] || "";
            }

            return url.searchParams.get("v") || "";
        } catch {
            return "";
        }
    }

    async function loadBook(id, recommendedIndex) {
        const response = await fetch(
            `/ebook/${id}/data.js`,
            { cache: "no-cache" }
        );

        if (!response.ok) {
            throw new Error(
                `${id}/data.js の取得に失敗しました。`
            );
        }

        const source = await response.text();
        const meta = parseFrontmatter(source);

        return {
            type: "ebook",
            id,
            recommendedIndex,
            ...meta,
            href: getBookHref({
                id,
                href: meta.href
            }),
            imageUrl:
                `/ebook/${id}/img/thumbnail.webp`,
            fallbackImageUrl:
                resolveAssetUrl(id, meta.cover)
        };
    }

    function normalizeVideos(videos) {
        return (videos || [])
            .filter((video) => video.url)
            .map((video, recommendedIndex) => ({
                type: "video",
                recommendedIndex,
                ...video,
                themes: parseThemes(video.themes),
                published: video.published || "",
                href: video.url,
                imageUrl:
                    video.thumbnail ||
                    `https://i.ytimg.com/vi/${getYoutubeId(video.url)}/hqdefault.jpg`
            }));
    }

    function getCurrentItems() {
        return state.items[state.view];
    }

    function getCurrentFilter() {
        return state.filters[state.view];
    }

    function sortItems(items, sort) {
        const sorted = [...items];

        if (sort === "newest") {
            return sorted.sort((a, b) => {
                const publishedOrder =
                    (b.published || "").localeCompare(
                        a.published || ""
                    );

                return publishedOrder !== 0
                    ? publishedOrder
                    : a.recommendedIndex - b.recommendedIndex;
            });
        }

        return sorted.sort(
            (a, b) =>
                a.recommendedIndex - b.recommendedIndex
        );
    }

    function filterItems(items, theme) {
        if (theme === "すべて") {
            return [...items];
        }

        return items.filter((item) =>
            item.themes.includes(theme)
        );
    }

    function getVisibleItems() {
        const filter = getCurrentFilter();

        return sortItems(
            filterItems(
                getCurrentItems(),
                filter.theme
            ),
            filter.sort
        );
    }

    function getAvailableThemes() {
        const discovered = [
            ...new Set(
                getCurrentItems()
                    .flatMap((item) => item.themes)
            )
        ];

        const preferred = config.themes || [];

        return [
            ...preferred.filter((theme) =>
                discovered.includes(theme)
            ),
            ...discovered.filter((theme) =>
                !preferred.includes(theme)
            )
        ];
    }

    function renderThemeOptions() {
        const filter = getCurrentFilter();
        const themes = getAvailableThemes();

        if (
            filter.theme !== "すべて" &&
            !themes.includes(filter.theme)
        ) {
            filter.theme = "すべて";
        }

        const fragment = document.createDocumentFragment();

        ["すべて", ...themes].forEach((theme) => {
            const option = document.createElement("option");
            option.value = theme;
            option.textContent = theme;
            fragment.appendChild(option);
        });

        els.themeSelect.replaceChildren(fragment);
        els.themeSelect.value = filter.theme;
    }

    function syncControls() {
        const filter = getCurrentFilter();

        renderThemeOptions();
        els.sortSelect.value = filter.sort;
    }

    function createTag(label) {
        const tag = document.createElement("span");
        tag.className = "catalog-tag";
        tag.textContent = label;

        return tag;
    }

    function appendCardMainContent(content, item) {
        if (item.themes.length) {
            const tags = document.createElement("div");
            tags.className = "catalog-card__tags";

            item.themes.forEach((theme) => {
                tags.appendChild(createTag(theme));
            });

            content.appendChild(tags);
        }

        const title = document.createElement("h2");
        title.className = "catalog-card__title";
        title.textContent = item.title;
        content.appendChild(title);

        if (item.description) {
            const description = document.createElement("p");
            description.className =
                "catalog-card__description";
            description.textContent = item.description;
            content.appendChild(description);
        }
    }

    function appendCardMeta(content, rows) {
        const validRows = rows.filter(
            (row) => row.value
        );

        if (!validRows.length) return;

        const meta = document.createElement("div");
        meta.className = "catalog-card__meta";

        validRows.forEach((row) => {
            const element = row.dateTime
                ? document.createElement("time")
                : document.createElement("div");

            if (row.dateTime) {
                element.dateTime = row.dateTime;
            }

            element.textContent =
                `${row.label}：${row.value}`;

            meta.appendChild(element);
        });

        content.appendChild(meta);
    }

    function createBaseCard(item, options = {}) {
        const card = document.createElement("a");
        card.className = "catalog-card";
        card.href = item.href;
        card.setAttribute(
            "aria-label",
            options.ariaLabel || item.title
        );

        if (options.external) {
            card.target = "_blank";
            card.rel = "noopener noreferrer";
        }

        const media = document.createElement("div");
        media.className = [
            "catalog-card__media",
            options.mediaClass
        ].filter(Boolean).join(" ");

        const image = document.createElement("img");
        image.className = "catalog-card__image";
        image.src = item.imageUrl;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";

        media.appendChild(image);

        const content = document.createElement("div");
        content.className = "catalog-card__content";

        card.append(media, content);

        return {
            card,
            media,
            image,
            content
        };
    }

    function createBookCard(book) {
        const {
            card,
            media,
            image,
            content
        } = createBaseCard(book, {
            ariaLabel: `${book.title}を読む`
        });

        let fallbackApplied = false;

        image.addEventListener("error", () => {
            if (
                !fallbackApplied &&
                book.fallbackImageUrl
            ) {
                fallbackApplied = true;
                image.src = book.fallbackImageUrl;
                return;
            }

            media.classList.add(
                "catalog-card__media--empty"
            );
            image.remove();
        });

        appendCardMainContent(content, book);

        appendCardMeta(content, [
            {
                label: "発行日",
                value:
                    formatPublishedDate(book.published),
                dateTime: book.published
            }
        ]);

        return card;
    }

    function createVideoCard(video) {
        const {
            card,
            image,
            content
        } = createBaseCard(video, {
            ariaLabel:
                `${video.title}をYouTubeで見る`,
            external: true,
            mediaClass: "catalog-card__media--video"
        });

        image.addEventListener("error", () => {
            image.remove();
        });

        appendCardMainContent(content, video);

        appendCardMeta(content, [
            {
                label: "講師",
                value: video.lecturer
            },
            {
                label: "再生時間",
                value: video.duration
            },
            {
                label: "発行日",
                value:
                    formatPublishedDate(video.published),
                dateTime: video.published
            }
        ]);

        return card;
    }

    function renderItems() {
        const items = getVisibleItems();
        const view = VIEW_CONFIG[state.view];
        const fragment = document.createDocumentFragment();

        items.forEach((item) => {
            fragment.appendChild(
                view.createCard(item)
            );
        });

        els.grid.replaceChildren(fragment);

        els.status.textContent = items.length
            ? `${items.length}${view.unit}`
            : view.emptyText;
    }

    function updateTabs() {
        els.tabs.forEach((button) => {
            const active =
                button.dataset.catalogTab === state.view;

            button.setAttribute(
                "aria-selected",
                String(active)
            );
            button.tabIndex = active ? 0 : -1;
        });
    }

    function renderCurrentView() {
        const view = VIEW_CONFIG[state.view];

        els.description.textContent =
            view.description;

        syncControls();
        renderItems();
        updateTabs();
    }

    function bindEvents() {
        els.tabs.forEach((button) => {
            button.addEventListener("click", () => {
                state.view = button.dataset.catalogTab;
                renderCurrentView();
            });
        });

        els.themeSelect.addEventListener(
            "change",
            () => {
                getCurrentFilter().theme =
                    els.themeSelect.value;
                renderItems();
            }
        );

        els.sortSelect.addEventListener(
            "change",
            () => {
                getCurrentFilter().sort =
                    els.sortSelect.value;
                renderItems();
            }
        );
    }

    async function init() {
        state.items.video =
            normalizeVideos(config.videos);

        bindEvents();

        const results = await Promise.allSettled(
            config.books.map((id, index) =>
                loadBook(id, index)
            )
        );

        state.items.ebook = results
            .filter(
                (result) =>
                    result.status === "fulfilled"
            )
            .map((result) => result.value);

        results.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(
                    `eBookの読み込みに失敗しました: ${config.books[index]}`,
                    result.reason
                );
            }
        });

        renderCurrentView();
    }

    init();
})();
