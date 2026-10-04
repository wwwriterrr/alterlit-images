import DOMPurify from "dompurify";

/**
 * Комментарии — пользовательский HTML, выводим его только через этот фильтр.
 *
 * Что встречается в данных: абзацы, переносы, ссылки, упоминания старого редактора
 * (<a class="link" data-user="…" href="/profile/…">), форматирование нового
 * (strong/em/u) и вставленные видео YouTube (<div class="yt-attach"><iframe …>).
 * Всё прочее вырезается, включая iframe с любых других адресов.
 */
const YOUTUBE_EMBED = /^(?:https?:)?\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[\w-]+/i;

const purify = DOMPurify(window);

purify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "iframe") return;
  const src = (node as Element).getAttribute("src") ?? "";
  if (!YOUTUBE_EMBED.test(src)) node.parentNode?.removeChild(node);
});

purify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "IFRAME") {
    const src = node.getAttribute("src") ?? "";
    // «//www.youtube.com/…» → https, чтобы не зависеть от протокола страницы.
    node.setAttribute("src", src.startsWith("//") ? `https:${src}` : src);
    node.setAttribute("loading", "lazy");
    node.setAttribute("allowfullscreen", "");
    node.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  }
  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? "";
    // Свои страницы (профили) — в той же вкладке, чужие — в новой и без передачи реферера.
    if (/^\/(?!\/)/.test(href)) {
      node.removeAttribute("target");
      node.removeAttribute("rel");
    } else {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
  }
});

export function sanitizeComment(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "a", "strong", "b", "em", "i", "u", "s", "div", "span", "iframe"],
    // class не пропускаем: обёртку видео стилизуем через div:has(> iframe).
    ALLOWED_ATTR: ["href", "target", "rel", "src", "allowfullscreen", "loading", "referrerpolicy"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/|#)/i,
    // data-* из старого редактора (data-user у упоминаний) нам не нужны.
    ALLOW_DATA_ATTR: false,
  });
}
