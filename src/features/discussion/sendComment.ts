import type { AppDispatch, RootState } from "../../app/store";
import { commentsApi } from "../../api/commentsApi";
import type { ApiComment, ApiUser } from "../../types/api";
import { addPending, dropPending, normalizeComment, receiveComment } from "./commentsCache";

interface SendArg {
  imageId: number;
  html: string;
  images: File[];
  /** id верхнего комментария, если это ответ. */
  replyTo: number | null;
  author: ApiUser;
}

let nextTempId = -1;

/**
 * Отправка комментария с мгновенным показом.
 *
 * 1. Сразу кладём в список «отправляемый» комментарий с отрицательным id и
 *    локальными превью картинок.
 * 2. POST. Подтверждение приходит тем, что раньше: событием new_comment из сокета
 *    (сопоставляется по автору, тексту и родителю) или ответом POST. Второе
 *    подтверждение ничего не дублирует — комментарий с тем же id уже есть.
 * 3. Ошибка — убираем «отправляемый» и пробрасываем её форме: та вернёт текст.
 */
export function sendComment({ imageId, html, images, replyTo, author }: SendArg) {
  return async (dispatch: AppDispatch, _getState: () => RootState): Promise<void> => {
    const tempId = nextTempId--;
    const previews = images.map((file) => URL.createObjectURL(file));
    const pending: ApiComment = {
      id: tempId,
      dt: localIsoNow(),
      dt_modified: null,
      author,
      content: html || null,
      images: previews.map((url, index) => ({ id: tempId * 10 - index, url, preview: url })),
      likes: [],
      reply: [],
      on_comment: replyTo,
      pending: true,
    };
    dispatch(addPending(imageId, pending));

    try {
      const saved = await dispatch(commentsApi.endpoints.postComment.initiate({ imageId, html, images, replyTo })).unwrap();
      // В ответе POST у ответа нет on_comment — проставляем сами.
      dispatch(receiveComment(imageId, normalizeComment(saved, replyTo), tempId));
    } catch (error) {
      dispatch(dropPending(imageId, tempId));
      throw error;
    } finally {
      // Превью нужны, пока сервер не пришлёт свои картинки; с запасом освобождаем позже.
      setTimeout(() => previews.forEach((url) => URL.revokeObjectURL(url)), 60_000);
    }
  };
}

/** Текущее время в том же виде, что у бэка: без часового пояса. */
function localIsoNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/** Текст ошибки для формы: бэк присылает details. */
export function sendErrorMessage(error: unknown): string {
  const data = (error as { data?: { details?: unknown } } | undefined)?.data;
  const status = (error as { status?: unknown } | undefined)?.status;
  if (typeof data?.details === "string" && data.details.trim()) return data.details;
  if (status === 403) return "Не получилось отправить: нет доступа. Обновите страницу и войдите снова.";
  if (status === 413) return "Картинки слишком большие. Уменьшите их и попробуйте ещё раз.";
  return "Комментарий не отправился. Проверьте соединение и попробуйте ещё раз.";
}
