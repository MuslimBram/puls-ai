import { Fragment } from "react";
import { Link } from "react-router-dom";

const LINK_PATTERN = /(https?:\/\/[^\s]+|\/[A-Za-z0-9][A-Za-z0-9_\-\/.?#=&]*)/g;
const TRAILING_PUNCTUATION = /[),.;!?]+$/;

function splitTrailingPunctuation(value: string): { link: string; trailing: string } {
  const match = value.match(TRAILING_PUNCTUATION);
  if (!match) return { link: value, trailing: "" };
  return { link: value.slice(0, -match[0].length), trailing: match[0] };
}

export const PublicBotMessageContent = ({ content }: { content: string }) => {
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
          return (
            <Fragment key={index}>
              <Link to={link} className="font-medium underline underline-offset-2 hover:opacity-80">
                {link}
              </Link>
              {trailing}
            </Fragment>
          );
        }

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
};
