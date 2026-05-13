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

            animation:
                tmFadeIn 0.25s ease;
        }

        @keyframes tmFadeIn {
            from {
                opacity: 0;
                transform:
                    translateY(8px)
                    scale(0.98);
            }

            to {
                opacity: 1;
                transform:
                    translateY(0)
                    scale(1);
            }
        }

        .threadmap-glass-header {

            display: flex;
            align-items: center;
            gap: 10px;

            padding:
                4px 4px 14px 4px;

            margin-bottom: 6px;
        }

        .tm-header-dot {

            width: 10px;
            height: 10px;

            border-radius: 999px;

            background:
                rgba(140,180,255,0.9);

            box-shadow:
                0 0 12px rgba(140,180,255,0.45);
        }

        .tm-header-title {

            font-size: 15px;
            font-weight: 600;

            letter-spacing: -0.02em;

            color:
                rgba(255,255,255,0.92);
        }

        #threadmap-content {

            overflow-y: auto;

            display: flex;
            flex-direction: column;

            gap: 8px;

            padding-right: 2px;
        }

        #threadmap-content::-webkit-scrollbar {
            width: 4px;
        }

        #threadmap-content::-webkit-scrollbar-thumb {

            background:
                rgba(255,255,255,0.08);

            border-radius: 999px;
        }

        .threadmap-item {
            cursor: pointer;
        }

        .tm-node {

            position: relative;

            padding:
                12px 14px;

            border-radius: 18px;

            background:
                rgba(255,255,255,0.04);

            border:
                1px solid rgba(255,255,255,0.05);

            transition:
                all 0.18s ease;

            overflow: hidden;
        }

        .tm-node::before {

            content: "";

            position: absolute;

            inset: 0;

            background:
                linear-gradient(
                    180deg,
                    rgba(255,255,255,0.04),
                    rgba(255,255,255,0)
                );

            pointer-events: none;
        }

        .tm-node:hover {

            transform:
                translateY(-1px);

            background:
                rgba(255,255,255,0.06);

            border:
                1px solid rgba(255,255,255,0.08);
        }

        .tm-node.active {

            background:
                rgba(120,170,255,0.12);

            border:
                1px solid rgba(120,170,255,0.18);

            box-shadow:
                0 0 20px rgba(120,170,255,0.08);
        }

        .tm-title {

            font-size: 13px;
            font-weight: 600;

            line-height: 1.45;

            color:
                rgba(255,255,255,0.94);

            display: -webkit-box;

            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;

            overflow: hidden;
        }

        .tm-preview {

            margin-top: 4px;

            font-size: 11px;
            line-height: 1.5;

            color:
                rgba(255,255,255,0.52);

            display: -webkit-box;

            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;

            overflow: hidden;
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

    sidebar.style.top = "24px";
    sidebar.style.right = "24px";

    sidebar.style.width = "300px";
    sidebar.style.maxHeight = "70vh";

    sidebar.style.padding = "14px";

    sidebar.style.borderRadius = "28px";

    sidebar.style.background =
        "rgba(20,20,20,0.32)";

    sidebar.style.backdropFilter =
        "blur(24px) saturate(180%)";

    sidebar.style.webkitBackdropFilter =
        "blur(24px) saturate(180%)";

    sidebar.style.border =
        "1px solid rgba(255,255,255,0.08)";

    sidebar.style.boxShadow = `
        0 8px 32px rgba(0,0,0,0.18),
        inset 0 1px 0 rgba(255,255,255,0.05)
    `;

    sidebar.style.zIndex = "999999";

    sidebar.style.display = "flex";
    sidebar.style.flexDirection = "column";

    sidebar.style.overflow = "hidden";

    sidebar.style.color = "white";

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

                <div class="tm-title">
                    ${title}
                </div>

                <div class="tm-preview">
                    ${preview}
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

// function renderThreadMaps() {

//     threadMapMessages.forEach((msg) => {

//         if (msg.element.dataset.threadmapInjected) {
//             return;
//         }

//         msg.element.dataset.threadmapInjected = "true";

//         const threadMap = document.createElement("div");

//         threadMap.className = "threadmap-node";

//         threadMap.innerHTML = `
//             <div style="
//                 margin-top:10px;
//                 padding:10px;
//                 border-radius:12px;
//                 background:rgba(255,255,255,0.05);
//                 border:1px solid rgba(255,255,255,0.08);
//                 font-size:12px;
//                 line-height:1.4;
//             ">
//                 🌳 ${msg.text}
//             </div>
//         `;

//         msg.element.appendChild(threadMap);
//     });
// }

function initialize() {
    injectSidebar();

    collectMessages();

    renderSidebar();

    // renderThreadMaps();
}

initialize();


// observe DOM updates
const observer = new MutationObserver(() => {
    collectMessages();
    // renderThreadMaps();
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