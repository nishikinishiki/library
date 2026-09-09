(() => {
    "use strict";

    const config = window.EBOOK_CATALOG_CONFIG;

    if (!config?.books?.length) {
        console.error("EBOOK_CATALOG_CONFIG が見つかりません。");
        return;
    }

    const state = {
        books: [],
        theme: "すべて",
        sort: "recommended"
    };

    const els = {
        grid: document.getElementById("ebookGrid"),
        status: document.getElementById("catalogStatus"),
        themeFilters: document.getElementById("themeFilters"),
        sortSelect: document.getElementById("sortSelect")
    };

    function extractMarkdownSource(source) {
        const match = source.match(/window\.bookMarkdown\s*=\s*`([\s\S]*?)`\s*;/);
        return match ? match[1] : "";
    }

    function parseFrontmatter(source) {
        const markdown = extractMarkdownSource(source);
        const match = markdown.match(/^\s*---\s*\n([\s\S]*?)\n---/);

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
        if (/^(?:https?:)?\/\//.test(value) || value.startsWith("/")) {
            return value;
        }

        return `./${bookId}/${value.replace(/^\.\//, "")}`;
    }

    function getBookHref(book) {
        return book.href || `./${book.id}/`;
    }

    async function loadBook(id, recommendedIndex) {
        const response = await fetch(`./${id}/data.js`, {
            cache: "no-cache"
        });

        if (!response.ok) {
            throw new Error(`${id}/data.js の取得に失敗しました。`);
        }

        const source = await response.text();
        const meta = parseFrontmatter(source);

        return {
            id,
            recommendedIndex,
            ...meta,
            thumbnail: `./${id}/img/thumbnail.webp`,
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
            renderBooks();
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
            (a, b) => a.recommendedIndex - b.recommendedIndex
        );
    }

    function createTag(theme) {
        const tag = document.createElement("span");
        tag.className = "ebook-tag";
        tag.textContent = theme;
        return tag;
    }

    function createBookCard(book) {
        const card = document.createElement("a");
        card.className = "ebook-card";
        card.href = getBookHref(book);
        card.setAttribute("aria-label", `${book.title}を読む`);

        const media = document.createElement("div");
        media.className = "ebook-card__media";

        const image = document.createElement("img");
        image.className = "ebook-card__image";
        image.src = book.thumbnail;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";

        let fallbackApplied = false;

        image.addEventListener("error", () => {
            if (!fallbackApplied && book.coverUrl) {
                fallbackApplied = true;
                image.src = book.coverUrl;
                return;
            }

            media.classList.add("ebook-card__media--empty");
            image.remove();
        });

        media.appendChild(image);

        const content = document.createElement("div");
        content.className = "ebook-card__content";

        if (book.themes.length) {
            const tags = document.createElement("div");
            tags.className = "ebook-card__tags";

            book.themes.forEach((theme) => {
                tags.appendChild(createTag(theme));
            });

            content.appendChild(tags);
        }

        const title = document.createElement("h2");
        title.className = "ebook-card__title";
        title.textContent = book.title;
        content.appendChild(title);

        if (book.description) {
            const description = document.createElement("p");
            description.className = "ebook-card__description";
            description.textContent = book.description;
            content.appendChild(description);
        }

        card.append(media, content);
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

    async function init() {
        renderThemeFilters();

        els.sortSelect.addEventListener("change", () => {
            state.sort = els.sortSelect.value;
            renderBooks();
        });

        const results = await Promise.allSettled(
            config.books.map((id, index) =>
                loadBook(id, index)
            )
        );

        state.books = results
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value);

        results.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(
                    `eBookの読み込みに失敗しました: ${config.books[index]}`,
                    result.reason
                );
            }
        });

        renderBooks();
    }

    init();
})();
