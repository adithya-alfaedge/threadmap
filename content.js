console.log("ThreadMap initialized");

let threadMapMessages = [];

function injectSidebar() {

    const style = document.createElement("style");

    style.innerHTML = `
    
        #threadmap-sidebar {
            font-family:
                Inter,
                system-ui,
                sans-serif;
        }

        #threadmap-content {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
        }

        .threadmap-item {
            margin-bottom: 6px;
            cursor: pointer;
        }

        .tm-node {

            display: flex;
            gap: 10px;

            padding: 10px;

            border-radius: 10px;

            transition:
                background 0.15s ease,
                transform 0.15s ease;

            color: rgba(255,255,255,0.92);
        }

        .tm-node:hover {
            background:
                rgba(255,255,255,0.06);
        }

        .tm-node.active {
            background:
                rgba(138,180,255,0.14);

            border:
                1px solid rgba(138,180,255,0.2);
        }

        .tm-left {
            padding-top: 6px;
        }

        .tm-dot {

            width: 8px;
            height: 8px;

            border-radius: 999px;

            background: #8ab4ff;

            opacity: 0.8;
        }

        .tm-content {
            flex: 1;
            min-width: 0;
        }

        .tm-title {

            font-size: 13px;
            font-weight: 600;

            line-height: 1.35;

            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .tm-preview {

            margin-top: 3px;

            font-size: 11px;

            opacity: 0.6;

            line-height: 1.4;

            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;

            overflow: hidden;
        }

        #threadmap-content::-webkit-scrollbar {
            width: 6px;
        }

        #threadmap-content::-webkit-scrollbar-thumb {

            background:
                rgba(255,255,255,0.12);

            border-radius: 999px;
        }

    `;
    
    document.head.appendChild(style);

    if (document.getElementById("threadmap-sidebar")) {
        return;
    }

    if (!window.location.pathname.startsWith("/chat/")) {
        return;
    }

    const sidebar = document.createElement("div");

    sidebar.id = "threadmap-sidebar";

    sidebar.style.position = "fixed";
    sidebar.style.top = "0";
    sidebar.style.right = "0";
    sidebar.style.width = "320px";
    sidebar.style.height = "100vh";

    sidebar.style.background = "#1e1e1e";
    sidebar.style.borderLeft =
        "1px solid rgba(255,255,255,0.08)";

    sidebar.style.zIndex = "999999";

    sidebar.style.display = "flex";
    sidebar.style.flexDirection = "column";

    sidebar.style.overflow = "hidden";

    sidebar.innerHTML = `
        <div
            class="threadmap-header"
            style="
                padding:16px;
                font-size:16px;
                font-weight:600;
                border-bottom:1px solid rgba(255,255,255,0.08);
                flex-shrink:0;
                color:white;
            "
        >
            🌳 ThreadMap
        </div>

        <div
            id="threadmap-content"
            style="
                flex:1;
                overflow-y:auto;
                padding:10px;
            "
        ></div>
    `;

    document.body.appendChild(sidebar);
}
function renderSidebar() {

    const content = document.getElementById(
        "threadmap-content"
    );

    if (!content) return;

    content.innerHTML = "";

    threadMapMessages.forEach((msg, index) => {

        const node = document.createElement("div");

        node.className = "threadmap-item";

        // compact title
        const words = msg.text.split(" ");

        const title = words.slice(0, 6).join(" ");

        // lightweight preview
        const preview =
            words.slice(6, 18).join(" ");

        node.innerHTML = `
            <div class="tm-node">

                <div class="tm-left">
                    <div class="tm-dot"></div>
                </div>

                <div class="tm-content">

                    <div class="tm-title">
                        ${title}
                    </div>

                    <div class="tm-preview">
                        ${preview}
                    </div>

                </div>

            </div>
        `;

        // click → jump to message
        node.addEventListener("click", () => {

            msg.element.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            document
                .querySelectorAll(".tm-node.active")
                .forEach(el => {
                    el.classList.remove("active");
                });

            node
                .querySelector(".tm-node")
                .classList.add("active");
        });

        content.appendChild(node);
    });
}

function collectMessages() {

    const messages = document.querySelectorAll(
        '[data-testid="user-message"]'
    );

    threadMapMessages = [];

    messages.forEach((message, index) => {

        const textElement = message.querySelector("p");

        const messageText = textElement
            ? textElement.innerText.trim()
            : "";

        threadMapMessages.push({
            id: index + 1,
            text: messageText,
            element: message
        });
    });

    console.log(threadMapMessages);
}

function renderThreadMaps() {

    threadMapMessages.forEach((msg) => {

        if (msg.element.dataset.threadmapInjected) {
            return;
        }

        msg.element.dataset.threadmapInjected = "true";

        const threadMap = document.createElement("div");

        threadMap.className = "threadmap-node";

        threadMap.innerHTML = `
            <div style="
                margin-top:10px;
                padding:10px;
                border-radius:12px;
                background:rgba(255,255,255,0.05);
                border:1px solid rgba(255,255,255,0.08);
                font-size:12px;
                line-height:1.4;
            ">
                🌳 ${msg.text}
            </div>
        `;

        msg.element.appendChild(threadMap);
    });
}

function initialize() {
    injectSidebar();

    collectMessages();

    renderSidebar();

    renderThreadMaps();
}

initialize();


// observe DOM updates
const observer = new MutationObserver(() => {
    collectMessages();
    renderThreadMaps();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});


// SPA route detection
let lastPath = location.pathname;

setInterval(() => {

    const currentPath = location.pathname;

    if (currentPath !== lastPath) {

        lastPath = currentPath;

        // cleanup old sidebar
        const existing = document.getElementById(
            "threadmap-sidebar"
        );

        if (existing) {
            existing.remove();
        }

        // cleanup injection flags
        document
            .querySelectorAll('[data-threadmap-injected]')
            .forEach(el => {
                delete el.dataset.threadmapInjected;
            });

        initialize();
    }

}, 1000);