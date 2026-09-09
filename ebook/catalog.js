(() => {
    "use strict";

    const config = window.LIBRARY_CATALOG_CONFIG;

    if (!config?.books?.length) {
        console.error("LIBRARY_CATALOG_CONFIG が見つかりません。");
        return;
    }

    const state = {
        view: "ebook",
        books: [],
        theme: "すべて",
        sort: "recommended"
    };

    const els = {
        tabs: [...document.querySelectorAll("[data-catalog-tab]")],
        description: document.getElementById("catalogDescription"),
        controls: document.getElementById("catalogControls"),
        grid: document.getElementById("catalogGrid"),
        status: document.getElementById("catalogStatus"),
        themeFilters: document.getElementById("themeFilters"),
        sortSelect: document.getElementById("sortSelect")
    };

    const descriptions = {
        ebook:
            "マンション投資をはじめとした不動産投資の情報から、投資や節税について気になる情報をeBookにまとめました。今後も続々公開予定です。お楽しみに。",
        video:
            "不動産投資や資産形成について、動画で学べるセミナーをYouTubeでご覧いただけます。"
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
            themes: (meta.themes || "")
                .split(",")
                .map((theme) => theme.trim())
                .filter(Boolean),
            href: meta.href || ""
        };
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
        return `${year}.${month}.${day}`;
    }

    function getYoutubeId(value) {
        try {
            const url = new URL(value);

            if (url.hostname === "youtu.be") {
                return url.pathname.split("/").filter(Boolean)[0] || "";
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
            id,
            recommendedIndex,
            ...meta,
            thumbnail: `/ebook/${id}/img/thumbnail.webp`,
            coverUrl: resolveAssetUrl(id, meta.cover)
        };
    }

    function createThemeChip(label) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "theme-chip";
        button.textContent = label;
        button.dataset.theme = label;
        button.setAttribute(
            "aria-pressed",
            String(label === state.theme)
        );

        button.addEventListener("click", () => {
            state.theme = label;
            updateThemeButtons();
            renderCurrentView();
        });

        return button;
    }

    function renderThemeFilters() {
        const fragment = document.createDocumentFragment();

        ["すべて", ...config.themes].forEach((theme) => {
            fragment.appendChild(createThemeChip(theme));
        });

        els.themeFilters.replaceChildren(fragment);
    }

    function updateThemeButtons() {
        els.themeFilters
            .querySelectorAll(".theme-chip")
            .forEach((button) => {
                button.setAttribute(
                    "aria-pressed",
                    String(button.dataset.theme === state.theme)
                );
            });
    }

    function getVisibleBooks() {
        const filtered = state.theme === "すべて"
            ? [...state.books]
            : state.books.filter((book) =>
                book.themes.includes(state.theme)
            );

        if (state.sort === "newest") {
            return filtered.sort((a, b) => {
                const publishedOrder =
                    b.published.localeCompare(a.published);

                return publishedOrder !== 0
                    ? publishedOrder
                    : a.recommendedIndex - b.recommendedIndex;
            });
        }

        return filtered.sort(
            (a, b) =>
                a.recommendedIndex - b.recommendedIndex
        );
    }

    function createTag(label) {
        const tag = document.createElement("span");
        tag.className = "catalog-tag";
        tag.textContent = label;
        return tag;
    }

    function createBaseCard({
        href,
        title,
        imageUrl,
        external = false,
        imageClass = ""
    }) {
        const card = document.createElement("a");
        card.className = "catalog-card";
        card.href = href;
        card.setAttribute("aria-label", title);

        if (external) {
            card.target = "_blank";
            card.rel = "noopener noreferrer";
        }

        const media = document.createElement("div");
        media.className = [
            "catalog-card__media",
            imageClass
        ].filter(Boolean).join(" ");

        const image = document.createElement("img");
        image.className = "catalog-card__image";
        image.src = imageUrl;
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
        } = createBaseCard({
            href: getBookHref(book),
            title: `${book.title}を読む`,
            imageUrl: book.thumbnail
        });

        let fallbackApplied = false;

        image.addEventListener("error", () => {
            if (!fallbackApplied && book.coverUrl) {
                fallbackApplied = true;
                image.src = book.coverUrl;
                return;
            }

            media.classList.add(
                "catalog-card__media--empty"
            );
            image.remove();
        });

        if (book.themes.length) {
            const tags = document.createElement("div");
            tags.className = "catalog-card__tags";

            book.themes.forEach((theme) => {
                tags.appendChild(createTag(theme));
            });

            content.appendChild(tags);
        }

        const title = document.createElement("h2");
        title.className = "catalog-card__title";
        title.textContent = book.title;
        content.appendChild(title);

        if (book.description) {
            const description = document.createElement("p");
            description.className =
                "catalog-card__description";
            description.textContent = book.description;
            content.appendChild(description);
        }

        if (book.published) {
            const published = document.createElement("time");
            published.className = "catalog-card__date";
            published.dateTime = book.published;
            published.textContent =
                formatPublishedDate(book.published);
            content.appendChild(published);
        }

        return card;
    }

    function createVideoCard(video, index) {
        const youtubeId = getYoutubeId(video.url);
        const title =
            video.title || `動画セミナー ${index + 1}`;

        const {
            card,
            image,
            content
        } = createBaseCard({
            href: video.url,
            title: `${title}をYouTubeで見る`,
            imageUrl:
                video.thumbnail ||
                `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
            external: true,
            imageClass: "catalog-card__media--video"
        });

        image.addEventListener("error", () => {
            image.remove();
        });

        const tags = document.createElement("div");
        tags.className = "catalog-card__tags";
        tags.appendChild(createTag("動画セミナー"));
        content.appendChild(tags);

        const heading = document.createElement("h2");
        heading.className = "catalog-card__title";
        heading.textContent = title;
        content.appendChild(heading);

        const linkText = document.createElement("p");
        linkText.className = "catalog-card__description";
        linkText.textContent = "YouTubeで視聴する";
        content.appendChild(linkText);

        return card;
    }

    function renderBooks() {
        const books = getVisibleBooks();
        const fragment = document.createDocumentFragment();

        books.forEach((book) => {
            fragment.appendChild(createBookCard(book));
        });

        els.grid.replaceChildren(fragment);
        els.status.textContent = books.length
            ? `${books.length}冊`
            : "該当するeBookはありません";
    }

    function renderVideos() {
        const videos = (config.videos || [])
            .filter((video) => video.url);

        const fragment = document.createDocumentFragment();

        videos.forEach((video, index) => {
            fragment.appendChild(
                createVideoCard(video, index)
            );
        });

        els.grid.replaceChildren(fragment);
        els.status.textContent = videos.length
            ? `${videos.length}本`
            : "動画セミナーは準備中です";
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
        const isEbook = state.view === "ebook";

        els.controls.hidden = !isEbook;
        els.description.textContent =
            descriptions[state.view];

        if (isEbook) {
            renderBooks();
        } else {
            renderVideos();
        }

        updateTabs();
    }

    function bindTabs() {
        els.tabs.forEach((button) => {
            button.addEventListener("click", () => {
                state.view = button.dataset.catalogTab;
                renderCurrentView();
            });
        });
    }

    async function init() {
        renderThemeFilters();
        bindTabs();

        els.sortSelect.addEventListener("change", () => {
            state.sort = els.sortSelect.value;
            renderCurrentView();
        });

        const results = await Promise.allSettled(
            config.books.map((id, index) =>
                loadBook(id, index)
            )
        );

        state.books = results
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
