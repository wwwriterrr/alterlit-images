import type { ApiReply } from "../../types/api";

/**
 * Живые обновления комментариев через сокет wss://alterlit.ru/ws/comments/postimages/<id>/.
 *
 * Что известно о сервере (проверено 2026-10-03, см. docs/backend-api.md):
 * - Django Channels; без заголовка Origin — 403, гостей пускает;
 * - после подключения молчит, пока нет событий; протокольный ping раз в ~40 с;
 * - на ЛЮБОЕ сообщение от клиента падает с кодом 1011 — поэтому мы ничего не отправляем.
 */
export function commentsSocketUrl(imageId: number): string {
  // Тот же домен, что у страницы: в проде это alterlit.ru, в dev — прокси Vite.
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/comments/postimages/${imageId}/`;
}

export type CommentEvent =
  /** Создан. Картинок ещё нет — они привязываются отдельно и приходят в «updated». */
  | { kind: "created"; comment: ApiReply }
  | { kind: "updated"; comment: ApiReply }
  | { kind: "deleted"; id: number };

/**
 * Сообщения приходят в обёртке { message: { type, comment, m2m? } }:
 * - new_comment — комментарий создан (у ответа есть on_comment);
 * - change_comment — изменён; с m2m: "post_add" — к нему привязались картинки;
 * - remove_comment — удалён: { comment_id, on_comment } без самого комментария.
 */
export function parseCommentEvent(raw: unknown): CommentEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const message = (raw as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const { type, comment, comment_id } = message as { type?: unknown; comment?: ApiReply; comment_id?: unknown };
  const hasComment = Boolean(comment && typeof comment.id === "number");

  if (type === "new_comment" && hasComment) return { kind: "created", comment: comment! };
  if (type === "change_comment" && hasComment) return { kind: "updated", comment: comment! };
  if (type === "remove_comment" && typeof comment_id === "number") return { kind: "deleted", id: comment_id };
  return null;
}
