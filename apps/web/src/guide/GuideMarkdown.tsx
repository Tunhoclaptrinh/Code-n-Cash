import { Fragment, type ReactNode } from "react";
import { Alert, Image } from "antd";
import { Lexer, type Token, type Tokens } from "marked";
import { Link } from "react-router-dom";
import { fold } from "@codecash/contracts";
import styles from "./guide.module.css";

/** Markdown points at public/guide/images (readable on GitHub); the app serves /guide/images. */
const imageSrc = (href: string) => {
  const file = href.split("/guide/images/")[1];
  return file ? `${import.meta.env.BASE_URL}guide/images/${file}` : href;
};

/** Anchor of a heading: "Bộ lọc & tìm kiếm" → "bo-loc-tim-kiem". */
export const headingId = (text: string) =>
  fold(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const textOf = (tokens: Token[] | undefined): string =>
  (tokens ?? [])
    .map((t) =>
      "tokens" in t && t.tokens ? textOf(t.tokens) : "text" in t ? t.text : "",
    )
    .join("");

function inline(tokens: Token[] | undefined, key: string): ReactNode[] {
  return (tokens ?? []).map((token, index) => {
    const k = `${key}.${index}`;
    switch (token.type) {
      case "text":
        return "tokens" in token && token.tokens ? (
          <Fragment key={k}>{inline(token.tokens, k)}</Fragment>
        ) : (
          <Fragment key={k}>{(token as Tokens.Text).text}</Fragment>
        );
      case "strong":
        return (
          <strong key={k}>{inline((token as Tokens.Strong).tokens, k)}</strong>
        );
      case "em":
        return <em key={k}>{inline((token as Tokens.Em).tokens, k)}</em>;
      case "del":
        return <del key={k}>{inline((token as Tokens.Del).tokens, k)}</del>;
      case "codespan":
        return (
          <code key={k} className={styles.code}>
            {(token as Tokens.Codespan).text}
          </code>
        );
      case "br":
        return <br key={k} />;
      case "link": {
        const link = token as Tokens.Link;
        const content = inline(link.tokens, k);
        // App routes stay in the app; anything else opens in a new tab.
        return link.href.startsWith("/guide/samples/") ? (
          <a key={k} href={link.href} download>
            {content}
          </a>
        ) : link.href.startsWith("/") ? (
          <Link key={k} to={link.href}>
            {content}
          </Link>
        ) : link.href.startsWith("#") ? (
          <a key={k} href={link.href}>
            {content}
          </a>
        ) : (
          <a key={k} href={link.href} target="_blank" rel="noreferrer">
            {content}
          </a>
        );
      }
      case "image": {
        const image = token as Tokens.Image;
        return (
          <Image
            key={k}
            src={imageSrc(image.href)}
            alt={image.text}
            className={styles.inlineImage}
          />
        );
      }
      default:
        // Raw HTML is shown as text: the guide never injects markup.
        return <Fragment key={k}>{token.raw}</Fragment>;
    }
  });
}

function block(token: Token, key: string): ReactNode {
  switch (token.type) {
    case "heading": {
      const heading = token as Tokens.Heading;
      const Tag = `h${Math.min(heading.depth + 1, 6)}` as "h2";
      return (
        <Tag
          key={key}
          id={headingId(textOf(heading.tokens))}
          className={styles.heading}
        >
          {inline(heading.tokens, key)}
        </Tag>
      );
    }
    case "paragraph": {
      const paragraph = token as Tokens.Paragraph;
      const only = paragraph.tokens.filter(
        (t) => !(t.type === "text" && !(t as Tokens.Text).text.trim()),
      );
      // A paragraph that is just an image is a figure: full width, caption, click to zoom.
      if (only.length === 1 && only[0].type === "image") {
        const image = only[0] as Tokens.Image;
        return (
          <figure key={key} className={styles.figure}>
            <Image src={imageSrc(image.href)} alt={image.text} />
            {image.title || image.text ? (
              <figcaption>{image.title || image.text}</figcaption>
            ) : null}
          </figure>
        );
      }
      return (
        <p key={key} className={styles.paragraph}>
          {inline(paragraph.tokens, key)}
        </p>
      );
    }
    case "list": {
      const list = token as Tokens.List;
      const ListTag = list.ordered ? "ol" : "ul";
      return (
        <ListTag
          key={key}
          className={styles.list}
          start={
            list.ordered && list.start !== "" ? Number(list.start) : undefined
          }
        >
          {list.items.map((item, i) => (
            <li key={`${key}.${i}`}>
              {item.tokens.map((child, j) =>
                child.type === "text" ? (
                  <Fragment key={j}>
                    {inline(
                      (child as Tokens.Text).tokens ?? [child],
                      `${key}.${i}.${j}`,
                    )}
                  </Fragment>
                ) : (
                  block(child, `${key}.${i}.${j}`)
                ),
              )}
            </li>
          ))}
        </ListTag>
      );
    }
    case "table": {
      const table = token as Tokens.Table;
      return (
        <div key={key} className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {table.header.map((cell, i) => (
                  <th
                    key={i}
                    style={{ textAlign: table.align[i] ?? undefined }}
                  >
                    {inline(cell.tokens, `${key}.h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      style={{ textAlign: table.align[i] ?? undefined }}
                    >
                      {inline(cell.tokens, `${key}.${r}.${i}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "blockquote": {
      // "> **Lưu ý:** …" is a note: shown as an info box.
      const quote = token as Tokens.Blockquote;
      return (
        <Alert
          key={key}
          type="info"
          showIcon
          className={styles.note}
          title={
            <div>
              {quote.tokens.map((child, i) => block(child, `${key}.${i}`))}
            </div>
          }
        />
      );
    }
    case "code":
      return (
        <pre key={key} className={styles.pre}>
          <code>{(token as Tokens.Code).text}</code>
        </pre>
      );
    case "hr":
      return <hr key={key} className={styles.hr} />;
    case "space":
      return null;
    default:
      return (
        <p key={key} className={styles.paragraph}>
          {token.raw}
        </p>
      );
  }
}

/** Renders the guide's Markdown as React elements; every screenshot opens a zoomable preview. */
export function GuideMarkdown({ source }: { source: string }) {
  const tokens = Lexer.lex(source);
  return (
    <Image.PreviewGroup>
      <article className={styles.article}>
        {tokens.map((token, index) => block(token, String(index)))}
      </article>
    </Image.PreviewGroup>
  );
}
