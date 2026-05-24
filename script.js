(function initFilePreviews() {
    const PREVIEW_WIDTH = 52;

    const DOC_ICON = `<svg class="file-preview-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2 5 5h-5V4zM8 13h8v2H8v-2zm0 4h5v2H8v-2z"/></svg>`;

    function resolveUrl(href) {
        return new URL(href, document.baseURI).href;
    }

    function getLinkKind(href) {
        const path = decodeURIComponent(href).split("?")[0].split("#")[0];
        if (/^https?:\/\//i.test(href)) {
            if (/\.pdf$/i.test(path)) return "pdf";
            return "web";
        }
        if (/\.pdf$/i.test(path)) return "pdf";
        if (/\.docx?$/i.test(path)) return "docx";
        if (/\.pptx?$/i.test(path)) return "pptx";
        return "other";
    }

    function getHostname(href) {
        try {
            return new URL(href).hostname.replace(/^www\./, "");
        } catch {
            return "web";
        }
    }

    function hashHue(str) {
        let h = 0;
        for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) % 360;
        return h;
    }

    function setupDocxPreview(container) {
        container.classList.add("file-preview--docx");
        container.innerHTML = DOC_ICON;
    }

    function setupWebPreview(container, href) {
        const host = getHostname(href);
        container.classList.add("file-preview--web");

        const img = document.createElement("img");
        img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";

        img.addEventListener("error", () => {
            container.classList.add("file-preview--web-fallback");
            container.style.setProperty("--preview-hue", String(hashHue(host)));
            container.replaceChildren();
            const label = document.createElement("span");
            label.className = "file-preview-fallback-letter";
            label.textContent = host.charAt(0).toUpperCase();
            container.append(label);
        });

        container.append(img);
    }

    function setupGenericPreview(container, label) {
        container.classList.add("file-preview--doc");
        container.textContent = label;
    }

    document.querySelectorAll(".file-list a[href]").forEach((link) => {
        const href = link.getAttribute("href") || "";
        const name = link.querySelector(".file-name");
        const meta = link.querySelector(".file-meta");
        if (!name) return;

        const preview = document.createElement("span");
        preview.className = "file-preview";

        const info = document.createElement("span");
        info.className = "file-info";
        info.append(name, meta);
        link.prepend(preview, info);

        const kind = getLinkKind(href);
        const metaLabel = meta ? meta.textContent.trim() : "";

        if (kind === "pdf") {
            preview.classList.add("file-preview--loading");
            preview.setAttribute("aria-hidden", "true");
            link.dataset.pdfSrc = resolveUrl(href);
            return;
        }

        if (kind === "docx") {
            setupDocxPreview(preview);
            preview.setAttribute("aria-hidden", "true");
            return;
        }

        if (kind === "web") {
            setupWebPreview(preview, href);
            preview.setAttribute("aria-hidden", "true");
            return;
        }

        setupGenericPreview(preview, metaLabel || "DOC");
        preview.setAttribute("aria-hidden", "true");
    });

    const queue = [];
    let active = 0;
    const MAX_CONCURRENT = 2;

    function runNext() {
        while (active < MAX_CONCURRENT && queue.length) {
            const job = queue.shift();
            active += 1;
            job().finally(() => {
                active -= 1;
                runNext();
            });
        }
    }

    function enqueue(task) {
        return new Promise((resolve, reject) => {
            queue.push(() => task().then(resolve, reject));
            runNext();
        });
    }

    function finishPreview(container) {
        container.classList.remove("file-preview--loading", "file-preview--error");
    }

    function embedPreview(url, container) {
        const embed = document.createElement("embed");
        embed.src = `${url}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`;
        embed.type = "application/pdf";
        embed.setAttribute("aria-hidden", "true");
        container.replaceChildren(embed);
        container.classList.add("file-preview--embed");
        finishPreview(container);
    }

    async function fetchPdfBytes(url) {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
    }

    async function renderPdfThumb(url, container) {
        if (typeof pdfjsLib === "undefined") {
            embedPreview(url, container);
            return;
        }

        const bytes = await fetchPdfBytes(url);
        const pdf = await pdfjsLib.getDocument({
            data: bytes,
            disableWorker: true,
            isEvalSupported: false,
        }).promise;

        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = PREVIEW_WIDTH / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
        }).promise;

        container.replaceChildren(canvas);
        container.classList.remove("file-preview--embed");
        finishPreview(container);
    }

    async function loadPreview(url, container) {
        try {
            await renderPdfThumb(url, container);
        } catch {
            try {
                embedPreview(url, container);
            } catch {
                container.classList.remove("file-preview--loading");
                container.classList.add("file-preview--error");
                container.textContent = "PDF";
            }
        }
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const link = entry.target;
                observer.unobserve(link);

                const url = link.dataset.pdfSrc;
                const preview = link.querySelector(".file-preview");
                if (!url || !preview) return;

                enqueue(() => loadPreview(url, preview));
            });
        },
        { rootMargin: "160px" }
    );

    document.querySelectorAll(".file-list a[data-pdf-src]").forEach((link) => {
        observer.observe(link);
    });
})();

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
        const href = this.getAttribute("href");
        if (href === "#") return;
        const target = document.querySelector(href);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });
});

window.addEventListener("scroll", () => {
    const sections = document.querySelectorAll("section[id]");
    const navLinks = document.querySelectorAll('.site-nav a[href^="#"]');

    let current = "";
    sections.forEach((section) => {
        const top = section.offsetTop;
        if (window.scrollY >= top - 120) {
            current = section.getAttribute("id");
        }
    });

    navLinks.forEach((link) => {
        const href = link.getAttribute("href");
        link.classList.toggle("active", href === `#${current}`);
    });
});
