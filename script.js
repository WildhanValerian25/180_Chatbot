const chatContainer = document.getElementById("chatContainer");
const messagesList = document.getElementById("messagesList");
const emptyState = document.getElementById("emptyState");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const newChatBtn = document.getElementById("newChatBtn");
const themeToggle = document.getElementById("themeToggle");
const statusText = document.getElementById("statusText");

let conversation = [];
let abortController = null;
let isStreaming = false;

// --- Theme ---
function initTheme() {
    const saved = localStorage.getItem("chatbot-theme");
    if (saved === "dark" || saved === "light") {
        document.documentElement.setAttribute("data-theme", saved);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.setAttribute("data-theme", "dark");
    }
}

themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("chatbot-theme", next);
});

initTheme();

// --- Helpers ---
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatInlineMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return html;
}

function renderMarkdown(rawText) {
    if (!rawText) return "";

    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const segments = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(rawText)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: "text", content: rawText.slice(lastIndex, match.index) });
        }
        segments.push({
            type: "code",
            lang: match[1] || "text",
            content: match[2].replace(/\n$/, ""),
        });
        lastIndex = codeBlockRegex.lastIndex;
    }

    if (lastIndex < rawText.length) {
        segments.push({ type: "text", content: rawText.slice(lastIndex) });
    }

    return segments
        .map((seg) => {
            if (seg.type === "code") {
                const escapedCode = escapeHtml(seg.content);
                const langLabel = escapeHtml(seg.lang);
                return `
                    <div class="code-block">
                        <div class="code-header">
                            <span>${langLabel}</span>
                            <button type="button" class="copy-code-btn" data-copy>Salin</button>
                        </div>
                        <pre><code>${escapedCode}</code></pre>
                    </div>
                `;
            }

            const blocks = seg.content.trim().split(/\n{2,}/);
            return blocks
                .filter((b) => b.trim().length > 0)
                .map((block) => {
                    const lines = block.split("\n");
                    const isUnordered = lines.every((l) => /^\s*[-*]\s+/.test(l));
                    const isOrdered = lines.every((l) => /^\s*\d+\.\s+/.test(l));

                    if (isUnordered) {
                        const items = lines
                            .map((l) => `<li>${formatInlineMarkdown(l.replace(/^\s*[-*]\s+/, ""))}</li>`)
                            .join("");
                        return `<ul>${items}</ul>`;
                    }

                    if (isOrdered) {
                        const items = lines
                            .map((l) => `<li>${formatInlineMarkdown(l.replace(/^\s*\d+\.\s+/, ""))}</li>`)
                            .join("");
                        return `<ol>${items}</ol>`;
                    }

                    const formattedLines = lines.map(formatInlineMarkdown).join("<br />");
                    return `<p>${formattedLines}</p>`;
                })
                .join("");
        })
        .join("");
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function setStreamingState(streaming) {
    isStreaming = streaming;
    sendBtn.classList.toggle("hidden", streaming);
    stopBtn.classList.toggle("hidden", !streaming);
    statusText.textContent = streaming ? "Sedang mengetik..." : "Siap membantu";
    statusText.classList.toggle("is-streaming", streaming);
    updateSendButton();
}

function updateSendButton() {
    sendBtn.disabled = isStreaming || messageInput.value.trim().length === 0;
}

function autoResizeInput() {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
}

// --- Message DOM Creation ---
function appendMessageElement(role, content = "") {
    emptyState.classList.add("hidden");

    const row = document.createElement("div");
    row.className = `message-row ${role}`;

    if (role === "assistant" || role === "error") {
        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = role === "error" ? "!" : "AI";
        row.appendChild(avatar);
    }

    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (role === "user") {
        bubble.textContent = content;
    } else if (role === "error") {
        bubble.textContent = content;
    } else {
        bubble.innerHTML = renderMarkdown(content);
    }

    wrap.appendChild(bubble);

    if (role === "assistant") {
        const actions = document.createElement("div");
        actions.className = "message-actions";

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "action-link";
        copyBtn.textContent = "Salin";
        copyBtn.addEventListener("click", () => {
            const raw = bubble.dataset.raw || "";
            navigator.clipboard.writeText(raw).then(() => {
                copyBtn.textContent = "Tersalin";
                setTimeout(() => {
                    copyBtn.textContent = "Salin";
                }, 1500);
            });
        });

        actions.appendChild(copyBtn);
        wrap.appendChild(actions);
    }

    row.appendChild(wrap);
    messagesList.appendChild(row);
    scrollToBottom();

    return bubble;
}

// Delegate copy button clicks inside code blocks
messagesList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const codeEl = btn.closest(".code-block")?.querySelector("code");
    if (!codeEl) return;

    navigator.clipboard.writeText(codeEl.textContent).then(() => {
        btn.textContent = "Tersalin";
        setTimeout(() => {
            btn.textContent = "Salin";
        }, 1500);
    });
});