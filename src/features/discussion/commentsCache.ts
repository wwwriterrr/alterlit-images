import type { AppDispatch, RootState } from "../../app/store";
import { commentsApi } from "../../api/commentsApi";
import { imagesApi } from "../../api/imagesApi";
import type { ApiComment, ApiCommentsPage, ApiReply } from "../../types/api";
import { editCancelled, replyCancelled } from "../viewer/viewerSlice";

/**
 * Правка кэша комментариев картинки: добавление, подтверждение, изменение, удаление.
 * Сюда сходятся и события сокета, и отправка формы, поэтому правила дублей одни:
 * комментарий с уже известным id второй раз не добавляется.
 */

type Thunk<T = void> = (dispatch: AppDispatch, getState: () => RootState) => T;
type Pages = { pages: ApiCommentsPage[] };

/** Нормализует комментарий из сокета/POST: в событиях нет likes и reply. */
export function normalizeComment(raw: ApiReply | ApiComment, parentId: number | null): ApiComment {
  return {
    ...raw,
    images: raw.images ?? [],
    likes: raw.likes ?? [],
    reply: "reply" in raw && Array.isArray(raw.reply) ? raw.reply : [],
    on_comment: parentId,
  };
}

function hasComment(draft: Pages, id: number): boolean {
  return draft.pages.some((page) => page.comments.some((item) => item.id === id || item.reply.some((reply) => reply.id === id)));
}

function isLoaded(getState: () => RootState, imageId: number, id: number): boolean {
  const data = commentsApi.endpoints.getComments.select(imageId)(getState()).data;
  return data ? hasComment(data as Pages, id) : false;
}

/** Найти «отправляемый» комментарий, которому соответствует пришедший с сервера. */
function findPendingFor(draft: Pages, comment: ApiComment): number | null {
  const sameText = (a: string | null, b: string | null) => normalizeHtml(a) === normalizeHtml(b);
  const matches = (item: ApiReply) =>
    item.pending === true && item.author.id === comment.author.id && sameText(item.content, comment.content);
  for (const page of draft.pages) {
    for (const item of page.comments) {
      if (comment.on_comment == null && matches(item)) return item.id;
      if (comment.on_comment != null && item.id === comment.on_comment) {
        const reply = item.reply.find(matches);
        if (reply) return reply.id;
      }
    }
  }
  return null;
}

function normalizeHtml(html: string | null): string {
  return (html ?? "").replace(/\s+/g, " ").trim();
}

function insert(draft: Pages, comment: ApiComment) {
  if (comment.on_comment != null) {
    for (const page of draft.pages) {
      const parent = page.comments.find((item) => item.id === comment.on_comment);
      if (parent) {
        parent.reply.push(comment);
        return;
      }
    }
    return; // родитель не загружен — увидим ответ при подгрузке
  }
  // Новые — в конец самой свежей страницы (она первая, внутри — от старых к новым).
  draft.pages[0]?.comments.push(comment);
}

function replace(draft: Pages, id: number, next: (current: ApiComment | ApiReply) => ApiComment | ApiReply | null) {
  for (const page of draft.pages) {
    const index = page.comments.findIndex((item) => item.id === id);
    if (index !== -1) {
      const result = next(page.comments[index]!);
      if (result) page.comments[index] = { ...(result as ApiComment), reply: page.comments[index]!.reply };
      else page.comments.splice(index, 1);
      return;
    }
    for (const item of page.comments) {
      const replyIndex = item.reply.findIndex((reply) => reply.id === id);
      if (replyIndex === -1) continue;
      const result = next(item.reply[replyIndex]!);
      if (result) item.reply[replyIndex] = result;
      else item.reply.splice(replyIndex, 1);
      return;
    }
  }
}

/** Счётчик comments у картинки в ленте (во всех загруженных лентах). Считает и ответы. */
function bumpCounter(imageId: number, delta: number): Thunk {
  return (dispatch, getState) => {
    const queries = getState()[commentsApi.reducerPath].queries;
    for (const entry of Object.values(queries)) {
      if (entry?.endpointName !== "getImages") continue;
      dispatch(
        imagesApi.util.updateQueryData("getImages", entry.originalArgs as unknown as string, (draft) => {
          for (const page of draft.pages) {
            const image = page.images.find((item) => item.id === imageId);
            if (image) image.comments = Math.max(0, image.comments + delta);
          }
        }),
      );
    }
  };
}

/** Пришёл настоящий комментарий (сокет new_comment или ответ POST). */
export function receiveComment(imageId: number, comment: ApiComment, confirmsPending: number | null = null): Thunk {
  return (dispatch, getState) => {
    if (isLoaded(getState, imageId, comment.id)) {
      // Уже показан (второе подтверждение) — убираем только «отправляемый» двойник, если есть.
      if (confirmsPending !== null) {
        dispatch(commentsApi.util.updateQueryData("getComments", imageId, (draft) => replace(draft, confirmsPending, () => null)));
      }
      return;
    }
    dispatch(
      commentsApi.util.updateQueryData("getComments", imageId, (draft) => {
        const pendingId = confirmsPending ?? findPendingFor(draft, comment);
        if (pendingId !== null && hasComment(draft, pendingId)) {
          // Подтверждаем: на месте «отправляемого» — настоящий. Локальные превью
          // картинок оставляем, пока сервер не пришлёт свои (change_comment).
          replace(draft, pendingId, (current) => ({
            ...comment,
            images: comment.images.length ? comment.images : current.images,
          }));
        } else {
          insert(draft, comment);
        }
      }),
    );
    dispatch(bumpCounter(imageId, 1));
  };
}

/** Сокет change_comment: изменился текст или привязались картинки. Ответы не трогаем. */
export function updateComment(imageId: number, comment: ApiReply): Thunk {
  return (dispatch) => {
    dispatch(
      commentsApi.util.updateQueryData("getComments", imageId, (draft) =>
        replace(draft, comment.id, (current) => ({
          ...current,
          ...comment,
          likes: comment.likes ?? current.likes,
          images: comment.images ?? current.images,
          on_comment: current.on_comment ?? null,
        })),
      ),
    );
  };
}

export function removeComment(imageId: number, id: number): Thunk {
  return (dispatch, getState) => {
    // Писали ответ на удалённый комментарий — отвечать больше некому.
    if (getState().viewer.replyTo?.commentId === id) dispatch(replyCancelled());
    if (getState().viewer.editing?.commentId === id) dispatch(editCancelled());
    if (!isLoaded(getState, imageId, id)) return;
    let removed = 1;
    dispatch(
      commentsApi.util.updateQueryData("getComments", imageId, (draft) => {
        // Удаление верхнего комментария уносит и его ответы — их тоже вычитаем из счётчика.
        const top = draft.pages.flatMap((page) => page.comments).find((item) => item.id === id);
        if (top) removed += top.reply.length;
        replace(draft, id, () => null);
      }),
    );
    dispatch(bumpCounter(imageId, -removed));
  };
}

/** «Отправляемый» комментарий: показываем сразу, до ответа сервера. */
export function addPending(imageId: number, comment: ApiComment): Thunk {
  return (dispatch) => {
    dispatch(commentsApi.util.updateQueryData("getComments", imageId, (draft) => insert(draft, comment)));
  };
}

export function dropPending(imageId: number, id: number): Thunk {
  return (dispatch) => {
    dispatch(commentsApi.util.updateQueryData("getComments", imageId, (draft) => replace(draft, id, () => null)));
  };
}
