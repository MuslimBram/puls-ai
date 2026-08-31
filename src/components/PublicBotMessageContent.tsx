import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const LINK_PATTERN = /(https?:\/\/[^\s]+|\/[A-Za-z0-9][A-Za-z0-9_\-\/.?#=&]*)/g;
const TRAILING_PUNCTUATION = /[),.;!?]+$/;
const PREVIEW_TARGET_CHARS = 280;
const PREVIEW_MAX_CHARS = 360;

const PUBLIC_INTERNAL_ROUTES = [
  "/",
  "/platform",
  "/platform/ai",
  "/platform/unified-inbox",
  "/platform/crm",
  "/platform/automation",
  "/platform/marketing",
  "/platform/analytics",
  "/platform/partners",
  "/platform/lidhjet",
  "/platform/developers",
  "/pricing",
  "/register",
  "/login",
  "/security",
  "/help-center",
  "/contact",
  "/white-label",
  "/install",
] as const;

const APPROVED_EXTERNAL_HOSTS = new Set(["pulse-bos.com", "www.pulse-bos.com"]);

function splitTrailingPunctuation(value: string): { link: string; trailing: string } {
  const match = value.match(TRAILING_PUNCTUATION);
  if (!match) return { link: value, trailing: "" };
  return { link: value.slice(0, -match[0].length), trailing: match[0] };
}

function createPreview(content: string): { preview: string; collapsible: boolean } {
  if (content.length <= PREVIEW_MAX_CHARS && !content.includes("\n\n")) {
    return { preview: content, collapsible: false };
  }

  const paragraphBreak = content.indexOf("\n\n");
  if (paragraphBreak >= 80 && paragraphBreak <= PREVIEW_MAX_CHARS) {
    return { preview: content.slice(0, paragraphBreak).trim(), collapsible: true };
  }

  const sentenceCandidates = [...content.matchAll(/[.!?](?:\s|$)/g)]
    .map((match) => (match.index ?? 0) + 1)
    .filter((index) => index >= PREVIEW_TARGET_CHARS && index <= PREVIEW_MAX_CHARS);
  const sentenceEnd = sentenceCandidates[0];
  if (sentenceEnd) {
    return { preview: content.slice(0, sentenceEnd).trim(), collapsible: true };
  }

  return {
    preview: `${content.slice(0, PREVIEW_TARGET_CHARS).trimEnd()}…`,
    collapsible: true,
  };
}

function isAllowedInternalRoute(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const parsed = new URL(value, "https://pulse-bos.com");
    return PUBLIC_INTERNAL_ROUTES.some((route) => parsed.pathname === route);
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && APPROVED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function LinkedContent({ content }: { content: string }) {
  const parts = content.split(LINK_PATTERN);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        const isInternal = part.startsWith("/");
        const isExternal = /^https?:\/\//i.test(part);
        if (!isInternal && !isExternal) return <Fragment key={index}>{part}</Fragment>;

        const { link, trailing } = splitTrailingPunctuation(part);
        if (!link) return <Fragment key={index}>{part}</Fragment>;

        if (isInternal) {
          if (!isAllowedInternalRoute(link)) return <Fragment key={index}>{part}</Fragment>;
          return (
            <Fragment key={index}>
              <Link to={link} className="font-medium underline underline-offset-2 hover:opacity-80">
                {link}
              </Link>
              {trailing}
            </Fragment>
          );
        }

        if (!isAllowedExternalUrl(link)) return <Fragment key={index}>{part}</Fragment>;
        return (
          <Fragment key={index}>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:opacity-80"
            >
              {link}
            </a>
            {trailing}
          </Fragment>
        );
      })}
    </>
  );
}

export const PublicBotMessageContent = ({ content }: { content: string }) => {
  const [expanded, setExpanded] = useState(false);
  const { preview, collapsible } = useMemo(() => createPreview(content), [content]);
  const visibleContent = expanded || !collapsible ? content : preview;

  return (
    <>
      <LinkedContent content={visibleContent} />
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 block text-xs font-medium underline underline-offset-2 hover:opacity-80"
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </>
  );
};
