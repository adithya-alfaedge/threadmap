console.log("ThreadMap initialized");

let threadMapMessages = [];

// ─── ID helpers ───────────────────────────────────────────────────────────────

function generateThreadId(index) {
    const chatId = window.location.pathname.split("/").pop();
    return `TM-${chatId}-${index}`;
}

const TM_TAG_PREFIX = "[ThreadMap ID: ";
const TM_TAG_SUFFIX = "]";
const TM_ID_REGEX   = /\[ThreadMap ID: (TM-[^\]]+)\]/;

// ─── Find which user-message "owns" a given DOM node ─────────────────────────
//
// Strategy: walk threadMapMessages in reverse and return the first one whose
// element appears BEFORE `node` in document order. This works regardless of
// what class/data-attribute Claude uses on its response containers.
//
function findOwnerMessage(node) {
    if (!node || !threadMapMessages.length) return null;

    for (let i = threadMapMessages.length - 1; i >= 0; i--) {
        const msg = threadMapMessages[i];
        const pos = msg.element.compareDocumentPosition(node);
        // DOCUMENT_POSITION_FOLLOWING (4): msg.element comes before node
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
            return { msg, idx: i };
        }
    }
    return null;
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

const observer = new MutationObserver(onDomMutation);
let _mutationDebounce = null;

function startObserving() {
    observer.observe(document.body, { childList: true, subtree: true });
}

function onDomMutation() {
    clearTimeout(_mutationDebounce);
    _mutationDebounce = setTimeout(() => {
        const beforeIds = threadMapMessages.map(m => m.id).join(",");
        collectMessages();
        const afterIds = threadMapMessages.map(m => m.id).join(",");
        if (beforeIds !== afterIds) renderSidebar();
    }, 250);
}

// ─── Collect user messages ────────────────────────────────────────────────────
//
// Every turn (user or AI) is wrapped in [data-test-render-count].
// AI response turns contain a direct child div.group
// User query turns do NOT — that's the distinguishing marker.
//
function collectMessages() {
    const allTurns = document.querySelectorAll('[data-test-render-count]');
    threadMapMessages = [];
    allTurns.forEach((turn) => {
        if (!turn.querySelector(':scope > .group')) {
            threadMapMessages.push({
                id:      generateThreadId(threadMapMessages.length),
                text:    turn.innerText.trim(),
                element: turn,
            });
        }
    });
}

// Returns true if `el` sits inside a user-query turn (no direct .group child)
function isInUserTurn(el) {
    const turn = el.closest('[data-test-render-count]');
    return turn ? !turn.querySelector(':scope > .group') : false;
}

// ─── Render sidebar items ─────────────────────────────────────────────────────

function renderSidebar() {
    const content = document.getElementById("threadmap-content");
    if (!content) return;

    observer.disconnect();
    content.innerHTML = "";

    threadMapMessages.forEach((msg) => {
        const node = document.createElement("div");
        node.className = "threadmap-item";
        //remove You Said: prefix from user messages
        if (msg.text.startsWith("You said: ")) {
            msg.text = msg.text.substring(10);
        }
        const words   = msg.text.split(" ");
        const title   = words.slice(0, 6).join(" ") || "(empty)";
        const preview = words.slice(6, 18).join(" ");

        node.innerHTML = `
            <div class="tm-node">
                <div class="tm-title">${escapeHtml(title)}</div>
                <div class="tm-preview">${escapeHtml(preview)}</div>
                <div class="tm-id-label">${msg.id}</div>
            </div>
        `;

        node.addEventListener("click", () => {
            msg.element.scrollIntoView({ behavior: "smooth", block: "center" });
            document.querySelectorAll(".tm-node.active")
                .forEach(el => el.classList.remove("active"));
            node.querySelector(".tm-node").classList.add("active");
        });

        content.appendChild(node);
    });

    startObserving();
}

// ─── Navigate by ID ───────────────────────────────────────────────────────────

function navigateToId(rawInput) {
    let tmId    = rawInput.trim();
    const match = TM_ID_REGEX.exec(rawInput);
    if (match) tmId = match[1];

    const msg = threadMapMessages.find(m => m.id === tmId);
    if (!msg) { shakeInput(); return false; }

    msg.element.scrollIntoView({ behavior: "smooth", block: "center" });
    document.querySelectorAll(".tm-node.active")
        .forEach(el => el.classList.remove("active"));

    const idx   = threadMapMessages.indexOf(msg);
    const items = document.querySelectorAll(".threadmap-item");
    if (items[idx]) {
        items[idx].querySelector(".tm-node").classList.add("active");
        items[idx].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    return true;
}

// ─── Visual feedback ──────────────────────────────────────────────────────────

function pulseItem(idx) {
    const items = document.querySelectorAll(".threadmap-item");
    if (!items[idx]) return;
    const node = items[idx].querySelector(".tm-node");
    node.classList.add("tm-pulse");
    setTimeout(() => node.classList.remove("tm-pulse"), 700);
}

function shakeInput() {
    const input = document.getElementById("tm-id-input");
    if (!input) return;
    input.classList.add("tm-shake");
    setTimeout(() => input.classList.remove("tm-shake"), 400);
}

// ─── Selection popup ──────────────────────────────────────────────────────────

let _popupEl          = null;
let _popupHideTimer   = null;
let _pendingTmId      = null;
let _pendingText      = null;
let _pendingIdx       = null;

function ensurePopup() {
    if (_popupEl) return _popupEl;

    _popupEl = document.createElement("div");
    _popupEl.id = "tm-copy-popup";
    _popupEl.innerHTML = `
        <button id="tm-copy-popup-btn">
            <span class="tm-popup-icon">🌳</span>
            <span class="tm-popup-label">Copy with ThreadMap</span>
        </button>
    `;
    document.body.appendChild(_popupEl);

    // mousedown: prevent losing the selection before we read it
    _popupEl.querySelector("#tm-copy-popup-btn")
        .addEventListener("mousedown", (e) => e.preventDefault());

    _popupEl.querySelector("#tm-copy-popup-btn")
        .addEventListener("click", doTaggedCopy);

    return _popupEl;
}

function showPopup(rect) {
    const popup = ensurePopup();

    popup.classList.remove("tm-popup-copied");
    popup.querySelector(".tm-popup-label").textContent = "Copy with ThreadMap";

    const popupWidth  = 215;
    const popupHeight = 36;
    const gap         = 10;

    const left    = Math.max(8, Math.min(
        rect.left + rect.width / 2 - popupWidth / 2,
        window.innerWidth - popupWidth - 8
    ));
    const topAbove = rect.top - popupHeight - gap;
    const top      = topAbove < 8 ? rect.bottom + gap : topAbove;

    popup.style.left = `${left}px`;
    popup.style.top  = `${top}px`;

    clearTimeout(_popupHideTimer);
    popup.classList.add("tm-popup-visible");
}

function hidePopup() {
    if (!_popupEl) return;
    _popupEl.classList.remove("tm-popup-visible");
    _pendingTmId = _pendingText = _pendingIdx = null;
}

function doTaggedCopy() {
    if (!_pendingTmId || !_pendingText) return;

    const tagged = `${_pendingText}\n\n${TM_TAG_PREFIX}${_pendingTmId}${TM_TAG_SUFFIX}`;

    navigator.clipboard.writeText(tagged).then(() => {
        const popup = ensurePopup();
        popup.classList.add("tm-popup-copied");
        popup.querySelector(".tm-popup-label").textContent = "Copied!";
        if (_pendingIdx !== null) pulseItem(_pendingIdx);
        _popupHideTimer = setTimeout(hidePopup, 1000);
    });
}

// Show popup on mouseup — use positional lookup, no fragile selectors
document.addEventListener("mouseup", (e) => {
    // Ignore clicks inside our own UI
    if (
        e.target.closest("#threadmap-sidebar") ||
        e.target.closest("#tm-copy-popup")
    ) return;

    setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
            hidePopup();
            return;
        }

        const range  = selection.getRangeAt(0);
        const anchor = range.commonAncestorContainer;
        const el     = anchor.nodeType === Node.TEXT_NODE
            ? anchor.parentElement
            : anchor;

        // Don't show popup for text selected inside a user query turn
        if (isInUserTurn(el)) {
            hidePopup();
            return;
        }

        // Find which user message precedes the selected text
        const owner = findOwnerMessage(el);
        if (!owner) { hidePopup(); return; }

        _pendingTmId = owner.msg.id;
        _pendingText = selection.toString();
        _pendingIdx  = owner.idx;

        showPopup(range.getBoundingClientRect());
    }, 30);
});

// Ctrl+C / Cmd+C path — same positional lookup
document.addEventListener("copy", (e) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range  = selection.getRangeAt(0);
    const anchor = range.commonAncestorContainer;
    const el     = anchor.nodeType === Node.TEXT_NODE
        ? anchor.parentElement
        : anchor;

    if (isInUserTurn(el)) return;

    const owner = findOwnerMessage(el);
    if (!owner) return;

    e.clipboardData.setData(
        "text/plain",
        `${selection.toString()}\n\n${TM_TAG_PREFIX}${owner.msg.id}${TM_TAG_SUFFIX}`
    );
    e.preventDefault();
    pulseItem(owner.idx);
    hidePopup();
});

// Hide popup when selection collapses
let _selChangeTimer = null;
document.addEventListener("selectionchange", () => {
    clearTimeout(_selChangeTimer);
    _selChangeTimer = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) hidePopup();
    }, 150);
});

// Hide on click outside
document.addEventListener("mousedown", (e) => {
    if (_popupEl && !_popupEl.contains(e.target)) hidePopup();
}, true);

// ─── Styles ───────────────────────────────────────────────────────────────────

function injectStyles() {
    if (document.getElementById("tm-styles")) return;
    const style = document.createElement("style");
    style.id = "tm-styles";
    style.innerHTML = `

        #threadmap-sidebar {
            font-family: Inter, system-ui, sans-serif;
            animation: tmFadeIn 0.25s ease;
        }

        @keyframes tmFadeIn {
            from { opacity: 0; transform: translateY(8px) scale(0.98); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        #threadmap-content {
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        #threadmap-content::-webkit-scrollbar { width: 4px; }
        #threadmap-content::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.08);
            border-radius: 999px;
        }

        .threadmap-item { cursor: pointer; }

        .tm-node {
            position: relative;
            padding: 12px 14px;
            border-radius: 18px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.05);
            transition: all 0.18s ease;
            overflow: hidden;
        }

        .tm-node::before {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0));
            pointer-events: none;
        }

        .tm-node:hover {
            transform: translateY(-1px);
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.08);
        }

        .tm-node.active {
            background: rgba(120,170,255,0.12);
            border: 1px solid rgba(120,170,255,0.18);
            box-shadow: 0 0 20px rgba(120,170,255,0.08);
        }

        @keyframes tmPulse {
            0%   { box-shadow: 0 0 0 0 rgba(120,170,255,0.5); }
            70%  { box-shadow: 0 0 0 8px rgba(120,170,255,0); }
            100% { box-shadow: 0 0 0 0 rgba(120,170,255,0); }
        }

        .tm-node.tm-pulse { animation: tmPulse 0.7s ease; }

        .tm-title {
            font-size: 13px;
            font-weight: 600;
            line-height: 1.45;
            color: rgba(255,255,255,0.94);
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .tm-preview {
            margin-top: 4px;
            font-size: 11px;
            line-height: 1.5;
            color: rgba(255,255,255,0.52);
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .tm-id-label {
            margin-top: 6px;
            font-size: 10px;
            font-family: monospace;
            color: rgba(120,170,255,0.55);
            letter-spacing: 0.02em;
        }

        /* Navigate bar */

        .tm-navigate-bar {
            flex-shrink: 0;
            padding: 10px 4px 2px;
            border-top: 1px solid rgba(255,255,255,0.07);
        }

        .tm-navigate-bar label {
            display: block;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: rgba(255,255,255,0.35);
            margin-bottom: 6px;
        }

        .tm-input-row { display: flex; gap: 6px; align-items: center; }

        #tm-id-input {
            flex: 1;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 7px 10px;
            font-size: 11.5px;
            font-family: monospace;
            color: rgba(255,255,255,0.85);
            outline: none;
            transition: border-color 0.15s, background 0.15s;
            min-width: 0;
        }

        #tm-id-input::placeholder { color: rgba(255,255,255,0.25); }

        #tm-id-input:focus {
            border-color: rgba(120,170,255,0.4);
            background: rgba(255,255,255,0.09);
        }

        @keyframes tmShake {
            0%,100% { transform: translateX(0); }
            20%     { transform: translateX(-5px); }
            60%     { transform: translateX(5px); }
            80%     { transform: translateX(-3px); }
        }

        #tm-id-input.tm-shake {
            border-color: rgba(255,100,100,0.55) !important;
            animation: tmShake 0.4s ease;
        }

        #tm-go-btn {
            flex-shrink: 0;
            background: rgba(120,170,255,0.15);
            border: 1px solid rgba(120,170,255,0.25);
            border-radius: 10px;
            color: rgba(140,185,255,0.9);
            font-size: 13px;
            padding: 6px 10px;
            cursor: pointer;
            transition: background 0.15s;
            line-height: 1;
        }

        #tm-go-btn:hover { background: rgba(120,170,255,0.25); }

        /* Copy popup */

        #tm-copy-popup {
            position: fixed;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            border-radius: 20px;
            overflow: hidden;
            background: rgba(18,18,22,0.92);
            backdrop-filter: blur(16px) saturate(160%);
            -webkit-backdrop-filter: blur(16px) saturate(160%);
            border: 1px solid rgba(255,255,255,0.12);
            box-shadow:
                0 6px 28px rgba(0,0,0,0.35),
                inset 0 1px 0 rgba(255,255,255,0.07);
            opacity: 0;
            transform: translateY(4px) scale(0.96);
            transform-origin: bottom center;
            pointer-events: none;
            transition: opacity 0.14s ease, transform 0.14s ease;
        }

        #tm-copy-popup.tm-popup-visible {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: auto;
        }

        /* caret pointing down toward the selection */
        #tm-copy-popup::after {
            content: "";
            position: absolute;
            bottom: -5px;
            left: 50%;
            transform: translateX(-50%) rotate(45deg);
            width: 8px;
            height: 8px;
            background: rgba(22,22,28,0.95);
            border-right: 1px solid rgba(255,255,255,0.10);
            border-bottom: 1px solid rgba(255,255,255,0.10);
        }

        #tm-copy-popup-btn {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 8px 16px;
            font-family: Inter, system-ui, sans-serif;
            font-size: 12.5px;
            font-weight: 600;
            letter-spacing: -0.01em;
            color: rgba(255,255,255,0.92);
            background: transparent;
            border: none;
            cursor: pointer;
            transition: background 0.12s;
            white-space: nowrap;
            user-select: none;
        }

        #tm-copy-popup-btn:hover  { background: rgba(120,170,255,0.13); }
        #tm-copy-popup-btn:active { background: rgba(120,170,255,0.22); }

        .tm-popup-icon { font-size: 14px; line-height: 1; }

        #tm-copy-popup.tm-popup-copied #tm-copy-popup-btn {
            color: rgba(100,220,150,0.95);
        }
    `;
    document.head.appendChild(style);
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function injectSidebar() {
    injectStyles();

    if (document.getElementById("threadmap-sidebar")) return;
    if (!window.location.pathname.startsWith("/chat/")) return;

    const sidebar = document.createElement("div");
    sidebar.id = "threadmap-sidebar";

    Object.assign(sidebar.style, {
        position:             "fixed",
        top:                  "24px",
        right:                "24px",
        width:                "300px",
        maxHeight:            "70vh",
        padding:              "14px",
        borderRadius:         "28px",
        background:           "rgba(20,20,20,0.32)",
        backdropFilter:       "blur(24px) saturate(180%)",
        webkitBackdropFilter: "blur(24px) saturate(180%)",
        border:               "1px solid rgba(255,255,255,0.08)",
        boxShadow:            "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.05)",
        zIndex:               "999999",
        display:              "flex",
        flexDirection:        "column",
        gap:                  "0px",
        overflow:             "hidden",
        color:                "white",
    });

    sidebar.innerHTML = `
        <div style="
            padding: 4px 4px 14px;
            font-size: 16px;
            font-weight: 600;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 8px;
        ">🌳 ThreadMap</div>

        <div id="threadmap-content"
             style="flex:1; overflow-y:auto; padding:10px 0;"></div>

        <div class="tm-navigate-bar">
            <label>Jump to message</label>
            <div class="tm-input-row">
                <input
                    id="tm-id-input"
                    type="text"
                    placeholder="Paste copied text or TM ID…"
                    autocomplete="off"
                    spellcheck="false"
                />
                <button id="tm-go-btn" title="Navigate">↵</button>
            </div>
        </div>
    `;

    document.body.appendChild(sidebar);

    const input = document.getElementById("tm-id-input");
    const goBtn = document.getElementById("tm-go-btn");

    input.addEventListener("paste", (e) => {
        const pasted = (e.clipboardData || window.clipboardData).getData("text");
        const match  = TM_ID_REGEX.exec(pasted);
        if (match) {
            e.preventDefault();
            input.value = match[1];
            navigateToId(match[1]);
        }
    });

    const tryNavigate = () => {
        const val = input.value.trim();
        if (val && navigateToId(val)) input.blur();
    };

    input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryNavigate(); });
    goBtn.addEventListener("click", tryNavigate);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function initialize() {
    injectSidebar();
    collectMessages();
    renderSidebar();
}

initialize();

// ─── SPA route detection ──────────────────────────────────────────────────────

let lastPath = location.pathname;

setInterval(() => {
    const currentPath = location.pathname;
    if (currentPath === lastPath) return;
    lastPath = currentPath;

    observer.disconnect();
    clearTimeout(_mutationDebounce);

    const existing = document.getElementById("threadmap-sidebar");
    if (existing) existing.remove();

    initialize();
}, 1000);