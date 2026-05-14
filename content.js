(function() {
    let state = {
        messages: [],
        tags: {},        // { id: [tags] }
        queryCache: {},  // { chatId: { index: "text" } }
        activeFilter: null,
        activeId: null,
        tooltipTimeout: null
    };

    const TAGS_KEY = "threadmap_v3_tags";
    const CACHE_KEY = "threadmap_query_cache"; // New key for query text
    let _refreshTimeout = null;

    async function init() {
        // Load both Tags and Query Cache from storage
        const stored = await chrome.storage.local.get([TAGS_KEY, CACHE_KEY]);
        state.tags = stored[TAGS_KEY] || {};
        state.queryCache = stored[CACHE_KEY] || {};
        
        injectSidebar();
        observeClaude();
        debouncedRefresh();
    }

    function debouncedRefresh() {
        clearTimeout(_refreshTimeout);
        _refreshTimeout = setTimeout(() => refresh(), 300);
    }

    async function collectMessages() {
        const turns = document.querySelectorAll("[data-test-render-count]");
        const chatId = window.location.pathname.split("/").pop();
        
        if (!chatId || chatId === 'chat' || chatId.length < 5) return;

        // Initialize cache for this specific thread if it doesn't exist
        if (!state.queryCache[chatId]) state.queryCache[chatId] = {};

        let cacheUpdated = false;

        state.messages = Array.from(turns)
            .filter(t => !t.querySelector(":scope > .group")) // Filter for User turns
            .map((t, i) => {
                const msgId = `TM-${chatId}-${i}`;
                
                // 1. Try to get LIVE text from DOM
                const textProvider = t.querySelector('.whitespace-pre-wrap') || t;
                let liveText = textProvider.innerText.trim();

                // 2. Persistence Logic
                if (liveText && liveText !== "...") {
                    // We found real text! Save/Update it in our cache
                    if (state.queryCache[chatId][i] !== liveText) {
                        state.queryCache[chatId][i] = liveText;
                        cacheUpdated = true;
                    }
                } else {
                    // DOM is empty/loading, try to FALLBACK to local cache
                    liveText = state.queryCache[chatId][i] || "";
                }

                return {
                    id: msgId,
                    text: liveText,
                    element: t
                };
            });

        // If we captured new text, save the whole cache back to storage
        if (cacheUpdated) {
            chrome.storage.local.set({ [CACHE_KEY]: state.queryCache });
        }
    }

    function refresh() {
        collectMessages();
        
        const list = document.getElementById("tm-list");
        const count = document.getElementById("tm-count");
        if (!list) return;

        // Render Filters
        renderFilters();
        
        const visibleMessages = state.activeFilter 
            ? state.messages.filter(m => (state.tags[m.id] || []).includes(state.activeFilter))
            : state.messages;

        count.textContent = visibleMessages.length;
        list.innerHTML = "";

        visibleMessages.forEach(msg => {
            const card = document.createElement("div");
            card.className = `tm-card ${state.activeId === msg.id ? 'active' : ''}`;
            
            const tags = state.tags[msg.id] || [];
            const tagHtml = tags.map(t => `<span class="tm-tag">${t}</span>`).join("");

            // Visual fix: If still empty after cache check, show a subtle loading state
            // const displayTitle = msg.text 
            //     ? (msg.text.length > 60 ? msg.text.slice(0, 60) + "..." : msg.text)
            //     : "<span style='opacity:0.3'>Awaiting content...</span>";

            // card.innerHTML = `
            //     <div class="tm-card-title">${displayTitle}</div>
            //     <div class="tm-card-id">${msg.id}</div>
            //     <div class="tm-tag-container">${tagHtml}</div>
            //     <div class="tm-card-actions">
            //         <button class="tm-add-tag-btn">+ Tag</button>
            //     </div>
            // `;

            const hasText = msg.text && msg.text.length > 0;
            const fullText = msg.text || "No content captured";
            const displayTitle = fullText.length > 50 ? fullText.slice(0, 50) + "..." : fullText;

            card.innerHTML = `
                <div class="tm-card-title">${displayTitle}</div>
                <div class="tm-card-id">${msg.id}</div>
                
                <div class="tm-tooltip">${fullText}</div>

                <div class="tm-tag-container">${tagHtml}</div>
                <div class="tm-card-actions">
                    <button class="tm-add-tag-btn">+ Tag</button>
                </div>
            `;
            card.querySelector(".tm-add-tag-btn").onclick = (e) => {
                e.stopPropagation();
                const val = prompt("Tag name:");
                if (val) saveTag(msg.id, val.toLowerCase().trim());
            };

            card.onclick = () => {
                msg.element.scrollIntoView({ behavior: "smooth", block: "center" });
                state.activeId = msg.id;
                debouncedRefresh();
            };
            list.appendChild(card);
        });
    }

    function saveTag(msgId, tag) {
        if (!state.tags[msgId]) state.tags[msgId] = [];
        if (!state.tags[msgId].includes(tag)) {
            state.tags[msgId].push(tag);
            chrome.storage.local.set({ [TAGS_KEY]: state.tags });
            debouncedRefresh();
        }
    }

    function renderFilters() {
        const bar = document.getElementById("tm-filter-bar");
        if (!bar) return;
        const allTags = new Set();
        Object.values(state.tags).forEach(arr => arr.forEach(t => allTags.add(t)));
        bar.innerHTML = "";
        allTags.forEach(tag => {
            const chip = document.createElement("div");
            chip.className = `tm-filter-chip ${state.activeFilter === tag ? 'active' : ''}`;
            chip.textContent = tag;
            chip.onclick = () => {
                state.activeFilter = (state.activeFilter === tag) ? null : tag;
                debouncedRefresh();
            };
            bar.appendChild(chip);
        });
    }

    function injectSidebar() {
        if (document.getElementById("tm-sidebar")) return;
        const side = document.createElement("div");
        side.id = "tm-sidebar";
        side.setAttribute('data-tm-ignore', 'true'); 
        side.innerHTML = `
            <div class="tm-header">
                <div class="tm-brand">🌳 ThreadMap</div>
                <div id="tm-count" class="tm-badge">0</div>
            </div>
            <div id="tm-filter-bar" class="tm-filters"></div>
            <div id="tm-list" class="tm-list"></div>
            <div class="tm-footer">
                <input type="text" id="tm-jump" placeholder="Search queries or IDs...">
            </div>
        `;
        document.body.appendChild(side);
    }

    function observeClaude() {
        const observer = new MutationObserver((mutations) => {
            const isSidebar = mutations.some(m => m.target.closest && m.target.closest('#tm-sidebar'));
            if (!isSidebar) debouncedRefresh();
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    init();
})();