import { useEffect, useRef } from "react";
import { useAppDispatch } from "../../app/hooks";
import { normalizeComment, receiveComment, removeComment, updateComment } from "./commentsCache";
import { commentsSocketUrl, parseCommentEvent } from "./commentsSocket";

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;

/**
 * Держит сокет комментариев открытым, пока открыт диалог с картинкой.
 * Обрыв — переподключаемся с нарастающей паузой; после переподключения вызываем
 * onReconnect, чтобы перезапросить комментарии и не потерять события за время обрыва.
 */
export function useCommentsSocket(imageId: number, onReconnect: () => void) {
  const dispatch = useAppDispatch();
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let wasConnected = false;
    let disposed = false;

    const connect = () => {
      socket = new WebSocket(commentsSocketUrl(imageId));

      socket.onopen = () => {
        if (wasConnected || attempt > 0) onReconnectRef.current();
        wasConnected = true;
        attempt = 0;
      };

      socket.onmessage = (message) => {
        let data: unknown;
        try {
          data = JSON.parse(String(message.data));
        } catch {
          return;
        }
        const event = parseCommentEvent(data);
        if (!event) {
          if (import.meta.env.DEV) console.debug("[comments socket] неизвестное сообщение", data);
          return;
        }
        if (event.kind === "created") dispatch(receiveComment(imageId, normalizeComment(event.comment, event.comment.on_comment ?? null)));
        if (event.kind === "updated") dispatch(updateComment(imageId, event.comment));
        if (event.kind === "deleted") dispatch(removeComment(imageId, event.id));
      };

      socket.onclose = () => {
        socket = null;
        if (disposed) return;
        // 1 с, 2 с, 4 с … до 30 с, с небольшим разбросом, чтобы клиенты не ломились разом.
        const delay = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** attempt) * (0.8 + Math.random() * 0.4);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socket?.close(1000);
    };
  }, [dispatch, imageId]);
}
