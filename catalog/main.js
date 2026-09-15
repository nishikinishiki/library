(() => {
    "use strict";

    const config = window.LIBRARY_CATALOG_CONFIG;

    if (!config?.books?.length) {
        console.error("LIBRARY_CATALOG_CONFIG が見つかりません。");
        return;
    }

    const tabs = [
        ...document.querySelectorAll("[data-catalog-tab]")
    ];
    const grid = document.getElementById("catalogGrid");
    let view = "ebook";

    const items = {
        ebook: [],
        video: (config.videos || []).map((video) => ({
            ...video,
            type: "video",
            href: video.url,
            imageUrl: `/catalog/img/video/${video.id}.webp`
        }))
    };

    function parseFrontmatter(source) {
        const markdown = source.match(
            /window\.bookMarkdown\s*=\s*`([\s\S]*?)`\s*;/
        )?.[1] || "";
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

            meta[line.slice(0, separator).trim()] =
                line.slice(separator + 1).trim();
        });

        return {
            title: meta.title || "無題",
            cover: meta.cover || "",
            published: meta.published || "",
            description: meta.description || "",
            themes: String(meta.themes || "")
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

        const meta = parseFrontmatter(await response.text());

        return {
            type: "ebook",
            id,
            ...meta,
            href: meta.href || `/ebook/${id}/`,
            imageUrl: `/ebook/${id}/img/thumbnail.webp`,
            fallbackImageUrl:
                resolveAssetUrl(id, meta.cover)
        };
    }

    function createTag(label, className = "") {
        const tag = document.createElement("span");
        tag.className =
            `catalog-tag${className ? ` ${className}` : ""}`;
        tag.textContent = label;

        const color = config.themeColors?.[label];
        if (color) {
            tag.style.setProperty(
                "--catalog-tag-color",
                color
            );
        }

        return tag;
    }

    function createCardTags(item) {
        const themes = item.themes || [];
        if (!themes.length && !item.duration) return null;

        const tags = document.createElement("div");
        tags.className = "catalog-card__tags";

        themes.forEach((theme) =>
            tags.appendChild(createTag(theme))
        );

        if (item.duration) {
            tags.appendChild(
                createTag(
                    item.duration,
                    "catalog-duration"
                )
            );
        }

        return tags;
    }

    function appendCardMainContent(
        content,
        item,
        { includeTags = true } = {}
    ) {
        if (includeTags) {
            const tags = createCardTags(item);
            if (tags) content.appendChild(tags);
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

        return { card, media, image, content };
    }

    function createBookCard(book) {
        const { card, media, image, content } =
            createBaseCard(book, {
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
        const { card, media, image, content } =
            createBaseCard(video, {
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

        const tags = createCardTags(video);
        if (tags) {
            card.insertBefore(tags, media);
        }

        appendCardMainContent(
            content,
            video,
            { includeTags: false }
        );
        return card;
    }

    function render() {
        tabs.forEach((button) => {
            const active =
                button.dataset.catalogTab === view;
            button.setAttribute(
                "aria-selected",
                String(active)
            );
            button.tabIndex = active ? 0 : -1;
        });

        const createCard = view === "ebook"
            ? createBookCard
            : createVideoCard;
        const fragment = document.createDocumentFragment();

        items[view].forEach((item) =>
            fragment.appendChild(createCard(item))
        );
        grid.replaceChildren(fragment);
    }

    async function init() {
        tabs.forEach((button) => {
            button.addEventListener("click", () => {
                view = button.dataset.catalogTab;
                render();
            });
        });

        items.ebook = (await Promise.all(
            config.books.map(async (id) => {
                try {
                    return await loadBook(id);
                } catch (error) {
                    console.error(
                        `eBookの読み込みに失敗しました: ${id}`,
                        error
                    );
                    return null;
                }
            })
        )).filter(Boolean);

        render();
    }

    init();
})();
