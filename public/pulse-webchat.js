(() => {
  "use strict";

  const script = document.currentScript;
  if (!script) return;

  const channelId = (script.dataset.channelId || "").trim();
  const endpoint = (script.dataset.endpoint || "").trim();
  const title = (script.dataset.title || "Chat with us").trim().slice(0, 80) || "Chat with us";

  if (!channelId || !endpoint) {
    console.error("[Pulse AI Webchat] data-channel-id and data-endpoint are required");
    return;
  }

  let endpointUrl;
  try {
    endpointUrl = new URL(endpoint);
    const isLocalhost = endpointUrl.hostname === "localhost" || endpointUrl.hostname === "127.0.0.1";
    if (endpointUrl.protocol !== "https:" && !(isLocalhost && endpointUrl.protocol === "http:")) {
      throw new Error("HTTPS required");
    }
    if (endpointUrl.username || endpointUrl.password) throw new Error("Credentials are not allowed in endpoint URL");
  } catch {
    console.error("[Pulse AI Webchat] invalid data-endpoint");
    return;
  }

  const makeEventId = () => {
    if (globalThis.crypto?.randomUUID) return `web:${globalThis.crypto.randomUUID()}`;
    const bytes = new Uint8Array(16);
    globalThis.crypto?.getRandomValues?.(bytes);
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `web:${token || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  };

  const create = (tag, attrs = {}, text = "") => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "className") node.className = value;
      else node.setAttribute(key, String(value));
    });
    if (text) node.textContent = text;
    return node;
  };

  const style = create("style");
  style.textContent = `
    .pulse-webchat-root{position:fixed;right:18px;bottom:18px;z-index:2147483000;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827}
    .pulse-webchat-toggle{width:56px;height:56px;border:0;border-radius:999px;background:#111827;color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.22);cursor:pointer;font-size:22px}
    .pulse-webchat-panel{display:none;position:absolute;right:0;bottom:68px;width:min(360px,calc(100vw - 28px));height:min(500px,calc(100vh - 110px));background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.2);overflow:hidden}
    .pulse-webchat-panel[data-open="true"]{display:flex;flex-direction:column}
    .pulse-webchat-head{padding:14px 16px;background:#111827;color:#fff;font-weight:700}
    .pulse-webchat-log{flex:1;overflow:auto;padding:14px;background:#f9fafb;display:flex;flex-direction:column;gap:9px}
    .pulse-webchat-msg{max-width:86%;padding:9px 11px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-break:break-word}
    .pulse-webchat-msg[data-role="user"]{align-self:flex-end;background:#111827;color:#fff}
    .pulse-webchat-msg[data-role="system"]{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;color:#374151}
    .pulse-webchat-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb;background:#fff}
    .pulse-webchat-input{flex:1;min-width:0;border:1px solid #d1d5db;border-radius:10px;padding:10px 11px;font:inherit;outline:none}
    .pulse-webchat-input:focus{border-color:#6b7280}
    .pulse-webchat-send{border:0;border-radius:10px;background:#111827;color:#fff;padding:0 14px;font-weight:600;cursor:pointer}
    .pulse-webchat-send:disabled{opacity:.55;cursor:not-allowed}
    @media (max-width:480px){.pulse-webchat-root{right:12px;bottom:12px}.pulse-webchat-panel{position:fixed;inset:12px;width:auto;height:auto;bottom:80px}}
  `;
  document.head.appendChild(style);

  const root = create("div", { className: "pulse-webchat-root" });
  const panel = create("section", { className: "pulse-webchat-panel", "data-open": "false", "aria-label": title });
  const header = create("div", { className: "pulse-webchat-head" }, title);
  const log = create("div", { className: "pulse-webchat-log", "aria-live": "polite" });
  const form = create("form", { className: "pulse-webchat-form" });
  const input = create("input", {
    className: "pulse-webchat-input",
    type: "text",
    maxlength: "5000",
    placeholder: "Write a message…",
    autocomplete: "off",
    "aria-label": "Message",
  });
  const send = create("button", { className: "pulse-webchat-send", type: "submit" }, "Send");
  const toggle = create("button", {
    className: "pulse-webchat-toggle",
    type: "button",
    "aria-label": `Open ${title}`,
    "aria-expanded": "false",
  }, "💬");

  const appendMessage = (role, text) => {
    const msg = create("div", { className: "pulse-webchat-msg", "data-role": role }, text);
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
  };

  appendMessage("system", "Send us a message. Pulse AI will route it securely to the business inbox.");

  form.append(input, send);
  panel.append(header, log, form);
  root.append(panel, toggle);
  document.body.appendChild(root);

  toggle.addEventListener("click", () => {
    const open = panel.dataset.open !== "true";
    panel.dataset.open = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    const eventId = makeEventId();
    appendMessage("user", message);
    input.value = "";
    send.disabled = true;

    try {
      const response = await fetch(endpointUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          event_id: eventId,
          message,
          page_url: globalThis.location?.href || undefined,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok !== true) throw new Error("send_failed");
      appendMessage("system", "Thanks — your message was received.");
    } catch {
      appendMessage("system", "Message could not be sent. Please try again.");
    } finally {
      send.disabled = false;
      input.focus();
    }
  });
})();
