(function initFilePreviews() {
    const PREVIEW_WIDTH = 52;
    const pdfLinks = document.querySelectorAll('.file-list a[href]');

    function resolvePdfUrl(href) {
        return new URL(href, document.baseURI).href;
    }

    pdfLinks.forEach((link) => {
        const href = link.getAttribute('href') || '';
        const isPdf = /\.pdf$/i.test(decodeURIComponent(href));
        const name = link.querySelector('.file-name');
        const meta = link.querySelector('.file-meta');
        if (!name) return;

        const preview = document.createElement('span');
        preview.className = 'file-preview';

        const info = document.createElement('span');
        info.className = 'file-info';
        info.append(name, meta);
        link.prepend(preview, info);

        if (!isPdf) {
            preview.classList.add('file-preview--doc');
            preview.textContent = meta ? meta.textContent : 'DOC';
            preview.setAttribute('aria-hidden', 'true');
            return;
        }

        preview.classList.add('file-preview--loading');
        preview.setAttribute('aria-hidden', 'true');
        link.dataset.pdfSrc = resolvePdfUrl(href);
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
        container.classList.remove('file-preview--loading', 'file-preview--error');
    }

    function embedPreview(url, container) {
        const embed = document.createElement('embed');
        embed.src = `${url}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`;
        embed.type = 'application/pdf';
        embed.setAttribute('aria-hidden', 'true');
        container.replaceChildren(embed);
        container.classList.add('file-preview--embed');
        finishPreview(container);
    }

    async function fetchPdfBytes(url) {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
    }

    async function renderPdfThumb(url, container) {
        if (typeof pdfjsLib === 'undefined') {
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

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
            canvasContext: canvas.getContext('2d'),
            viewport,
        }).promise;

        container.replaceChildren(canvas);
        container.classList.remove('file-preview--embed');
        finishPreview(container);
    }

    async function loadPreview(url, container) {
        try {
            await renderPdfThumb(url, container);
        } catch {
            try {
                embedPreview(url, container);
            } catch {
                container.classList.remove('file-preview--loading');
                container.classList.add('file-preview--error');
                container.textContent = 'PDF';
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
                const preview = link.querySelector('.file-preview');
                if (!url || !preview) return;

                enqueue(() => loadPreview(url, preview));
            });
        },
        { rootMargin: '160px' }
    );

    document.querySelectorAll('.file-list a[data-pdf-src]').forEach((link) => {
        observer.observe(link);
    });
})();

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        const target = document.querySelector(href);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.site-nav a[href^="#"]');

    let current = '';
    sections.forEach((section) => {
        const top = section.offsetTop;
        if (window.scrollY >= top - 120) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach((link) => {
        const href = link.getAttribute('href');
        link.classList.toggle('active', href === `#${current}`);
    });
});
