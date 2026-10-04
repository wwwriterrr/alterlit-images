import { useEffect, useState } from "react";
import type { ApiReply, ApiUser } from "../../types/api";

/**
 * Окно правки: обычный пользователь может изменить и удалить свой комментарий
 * 5 минут после отправки, staff — любой и без ограничения (окончательно решает бэк).
 *
 * Бэк отдаёт время без часового пояса, в московском (UTC+3, без перехода на летнее):
 * комментарий, созданный в 13:30 UTC, приходит с dt «16:30». Поэтому считаем от dt как
 * от московского времени — таймер верный при любом часовом поясе у пользователя.
 */
export const EDIT_WINDOW_MS = 5 * 60 * 1000;
const SERVER_UTC_OFFSET = "+03:00";

/** Момент, до которого автор может править комментарий; null — разбор не удался. */
export function editDeadline(comment: ApiReply): number | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(comment.dt);
  if (!match) return null;
  const created = Date.parse(`${match[1]}${SERVER_UTC_OFFSET}`);
  return Number.isNaN(created) ? null : created + EDIT_WINDOW_MS;
}

export interface CommentRights {
  canEdit: boolean;
  canDelete: boolean;
  /** До какого момента действуют права; null — без ограничения (staff). */
  deadline: number | null;
}

export function commentRights(comment: ApiReply, viewer: ApiUser | null, now = Date.now()): CommentRights {
  const none = { canEdit: false, canDelete: false, deadline: null };
  if (!viewer || comment.pending) return none;
  if (viewer.is_staff) return { canEdit: true, canDelete: true, deadline: null };
  if (comment.author.id !== viewer.id) return none;
  const deadline = editDeadline(comment);
  if (deadline === null || now >= deadline) return none;
  return { canEdit: true, canDelete: true, deadline };
}

/** Сколько секунд осталось до deadline; тикает раз в секунду и останавливается на нуле. */
export function useSecondsLeft(deadline: number | null): number | null {
  const compute = () => (deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  const [left, setLeft] = useState(compute);
  useEffect(() => {
    setLeft(compute());
    if (deadline === null) return;
    const timer = setInterval(() => {
      const next = compute();
      setLeft(next);
      if (next === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
    // compute зависит только от deadline
  }, [deadline]);
  return left;
}

export function formatSecondsLeft(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
