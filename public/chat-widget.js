(() => {
  "use strict";

  const script = document.currentScript || document.querySelector("script[data-channel-id][data-proxy-url]");
  if (!script) return;

  const channelId = (script.getAttribute("data-channel-id") || "").trim();
  const proxyUrl = (script.getAttribute("data-proxy-url") || "").trim();
  if (!channelId || !proxyUrl) {
    console.error("[Pulse AI Chat] data-channel-id and data-proxy-url are required");
    return;
  }

  if (document.getElementById("pulse-ai-chat-root")) return;

  const rawColor = (script.getAttribute("data-color") || "#3b82f6").trim();
  const color = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : "#3b82f6";
  const welcome = (script.getAttribute("data-welcome") || "Hi! How can we help you today?").slice(0, 500);
  const businessName = (script.getAttribute("data-name") || "Pulse AI").slice(0, 120);

  const host = document.createElement("div");
  host.id = "pulse-ai-chat-root";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .pulse-wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; }
    .pulse-launcher { width: 56px; height: 56px; border: 0; border-radius: 999px; background: ${color}; color: white; cursor: pointer; box-shadow: 0 12px 30px rgba(0,0,0,.2); font-size: 24px; display: grid; place-items: center; margin-left: auto; }
    .pulse-launcher:focus-visible, .pulse-close:focus-visible, .pulse-send:focus-visible, .pulse-input:focus-visible { outline: 3px solid rgba(59,130,246,.35); outline-offset: 2px; }
    .pulse-panel { width: min(360px, calc(100vw - 32px)); height: min(520px, calc(100vh - 104px)); background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 18px; box-shadow: 0 22px 60px rgba(0,0,0,.22); overflow: hidden; margin-bottom: 12px; display: none; flex-direction: column; }
    .pulse-panel[data-open="true"] { display: flex; }
    .pulse-header { background: ${color}; color: white; min-height: 64px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
    .pulse-title { flex: 1; min-width: 0; }
    .pulse-title strong { display: block; font-size: 15px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pulse-title span { display: block; font-size: 11px; opacity: .9; margin-top: 2px; }
    .pulse-close { width: 34px; height: 34px; border: 0; border-radius: 999px; background: rgba(255,255,255,.14); color: white; cursor: pointer; font-size: 20px; line-height: 1; }
    .pulse-messages { flex: 1; overflow-y: auto; padding: 14px; background: #f8fafc; }
    .pulse-bubble { max-width: 86%; padding: 10px 12px; border-radius: 14px; margin: 0 0 10px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
    .pulse-bubble.system { background: #fff; border: 1px solid rgba(15,23,42,.08); border-bottom-left-radius: 5px; }
    .pulse-bubble.user { background: ${color}; color: white; margin-left: auto; border-bottom-right-radius: 5px; }
    .pulse-status { min-height: 18px; padding: 0 14px 6px; font-size: 11px; color: #64748b; background: #fff; }
    .pulse-status.error { color: #b91c1c; }
    .pulse-form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid rgba(15,23,42,.08); background: #fff; }
    .pulse-input { flex: 1; min-width: 0; border: 1px solid #cbd5e1; border-radius: 12px; padding: 10px 11px; font: inherit; font-size: 13px; color: #111827; background: #fff; }
    .pulse-send { border: 0; border-radius: 12px; background: ${color}; color: white; padding: 0 14px; min-width: 64px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .pulse-send:disabled, .pulse-input:disabled { opacity: .6; cursor: not-allowed; }
    @media (max-width: 520px) {
      .pulse-wrap { right: 12px; bottom: 12px; left: 12px; }
      .pulse-panel { width: 100%; height: min(70vh, 560px); }
    }
    @media (prefers-reduced-motion: no-preference) {
      .pulse-panel[data-open="true"] { animation: pulse-in .16s ease-out; }
      @keyframes pulse-in { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
    }
  `;
  root.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "pulse-wrap";

  const panel = document.createElement("section");
  panel.className = "pulse-panel";
  panel.dataset.open = "false";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", `${businessName} chat`);

  const header = document.createElement("header");
  header.className = "pulse-header";
  const title = document.createElement("div");
  title.className = "pulse-title";
  const titleStrong = document.createElement("strong");
  titleStrong.textContent = businessName;
  const titleSub = document.createElement("span");
  titleSub.textContent = "Powered by Pulse AI";
  title.append(titleStrong, titleSub);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "pulse-close";
  close.setAttribute("aria-label", "Minimize chat");
  close.textContent = "−";
  header.append(title, close);

  const messages = document.createElement("div");
  messages.className = "pulse-messages";
  messages.setAttribute("aria-live", "polite");
  const welcomeBubble = document.createElement("div");
  welcomeBubble.className = "pulse-bubble system";
  welcomeBubble.textContent = welcome;
  messages.appendChild(welcomeBubble);

  const status = document.createElement("div");
  status.className = "pulse-status";

  const form = document.createElement("form");
  form.className = "pulse-form";
  const input = document.createElement("input");
  input.className = "pulse-input";
  input.type = "text";
  input.maxLength = 5000;
  input.autocomplete = "off";
  input.placeholder = "Write a message…";
  input.setAttribute("aria-label", "Chat message");
  const send = document.createElement("button");
  send.className = "pulse-send";
  send.type = "submit";
  send.textContent = "Send";
  form.append(input, send);

  panel.append(header, messages, status, form);

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "pulse-launcher";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.setAttribute("aria-expanded", "false");
  launcher.textContent = "💬";
  wrap.append(panel, launcher);
  root.appendChild(wrap);

  let pendingEventId = "";
  let pendingMessage = "";

  const createEventId = () => `wc:${crypto.randomUUID()}`;
  const setOpen = (open) => {
    panel.dataset.open = open ? "true" : "false";
    launcher.setAttribute("aria-expanded", String(open));
    if (open) setTimeout(() => input.focus(), 0);
  };
  launcher.addEventListener("click", () => setOpen(panel.dataset.open !== "true"));
  close.addEventListener("click", () => setOpen(false));

  const appendUserMessage = (text) => {
    const bubble = document.createElement("div");
    bubble.className = "pulse-bubble user";
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || message.length > 5000) return;

    if (!pendingEventId || pendingMessage !== message) {
      pendingEventId = createEventId();
      pendingMessage = message;
    }

    send.disabled = true;
    input.disabled = true;
    status.className = "pulse-status";
    status.textContent = "Sending…";

    try {
      const response = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        cache: "no-store",
        body: JSON.stringify({
          channel_id: channelId,
          event_id: pendingEventId,
          message,
          page_url: window.location.href,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) throw new Error("Message delivery failed");

      appendUserMessage(message);
      input.value = "";
      pendingEventId = "";
      pendingMessage = "";
      status.textContent = payload.duplicate ? "Message received." : "Sent.";
    } catch {
      status.className = "pulse-status error";
      status.textContent = "Could not send. Try again — the retry will reuse the same message ID.";
    } finally {
      send.disabled = false;
      input.disabled = false;
      input.focus();
    }
  });
})();
