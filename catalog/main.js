(() => {
    "use strict";

    const config = window.LIBRARY_CATALOG_CONFIG;

    if (!config?.books?.length) {
        console.error("LIBRARY_CATALOG_CONFIG が見つかりません。");
        return;
    }

    const themeMap = new Map(
        (config.themes || []).map((theme) => [
            theme.label,
            theme
        ])
    );

    const state = {
        view: "ebook",
        items: {
            ebook: [],
            video: []
        }
    };

    const els = {
        tabs: [...document.querySelectorAll("[data-catalog-tab]")],
        description: document.getElementById("catalogDescription"),
        grid: document.getElementById("catalogGrid")
    };

    const CARD_CREATORS = {
        ebook: createBookCard,
        video: createVideoCard
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

    async function loadBook(id) {
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
            .filter((video) => video.url && video.id)
            .map((video) => ({
                type: "video",
                ...video,
                themes: parseThemes(video.themes),
                href: video.url,
                imageUrl:
                    video.thumbnail ||
                    `/catalog/img/video/${video.id}.webp`
            }));
    }

    function getCurrentItems() {
        return state.items[state.view];
    }

    function createTag(label) {
        const tag = document.createElement("span");
        tag.className = "catalog-tag";
        tag.textContent = label;

        const theme = themeMap.get(label);

        if (theme?.color) {
            tag.style.setProperty(
                "--catalog-tag-color",
                theme.color
            );
        }

        return tag;
    }

    function formatDuration(value) {
        return String(value || "")
            .replace(/^約\s*/, "")
            .trim();
    }

    function createDurationTag(value) {
        const duration = document.createElement("span");
        duration.className =
            "catalog-tag catalog-duration";
        duration.textContent = formatDuration(value);

        return duration;
    }

    function appendCardMainContent(content, item) {
        const showDuration =
            item.type === "video" && item.duration;

        if (item.themes.length || showDuration) {
            const tags = document.createElement("div");
            tags.className = "catalog-card__tags";

            item.themes.forEach((theme) => {
                tags.appendChild(createTag(theme));
            });

            if (showDuration) {
                tags.appendChild(
                    createDurationTag(item.duration)
                );
            }

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

    function createBaseCard(item, options = {}) {
        const card = document.createElement("a");
        card.className =
            `catalog-card catalog-card--${item.type}`;
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

        return card;
    }

    function createVideoCard(video) {
        const {
            card,
            media,
            image,
            content
        } = createBaseCard(video, {
            ariaLabel:
                `${video.title}をYouTubeで見る`,
            external: true,
            mediaClass: "catalog-card__media--video"
        });

        image.addEventListener("error", () => {
            media.classList.add(
                "catalog-card__media--video-empty"
            );
            image.remove();
        });

        appendCardMainContent(content, video);

        return card;
    }

    function renderItems() {
        const items = getCurrentItems();
        const createCard = CARD_CREATORS[state.view];
        const fragment = document.createDocumentFragment();

        items.forEach((item) => {
            fragment.appendChild(createCard(item));
        });

        els.grid.replaceChildren(fragment);
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

    function renderViewHeader() {
        els.description.textContent =
            config.descriptions?.ebook || "";

        updateTabs();
    }

    function renderCurrentView() {
        renderViewHeader();
        renderItems();
    }

    function bindEvents() {
        els.tabs.forEach((button) => {
            button.addEventListener("click", () => {
                state.view = button.dataset.catalogTab;
                renderCurrentView();
            });
        });
    }

    async function init() {
        state.items.video =
            normalizeVideos(config.videos);

        bindEvents();
        renderViewHeader();

        const results = await Promise.allSettled(
            config.books.map((id) => loadBook(id))
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
