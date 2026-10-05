import { baseApi } from "./baseApi";
import type { ApiComment, ApiCommentsPage } from "../types/api";

export interface PostCommentArg {
  imageId: number;
  /** HTML комментария; пустая строка — комментарий из одних картинок. */
  html: string;
  images: File[];
  /** id комментария, на который отвечаем. */
  replyTo: number | null;
}

export const commentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * Комментарии к картинке. Первая страница — самые новые; следующая — более
     * старые, через filters={"date__lt": <dt самого старого из загруженных>}.
     * pageParam — эта дата.
     */
    getComments: build.infiniteQuery<ApiCommentsPage, number, string | null>({
      query: ({ queryArg: imageId, pageParam }) => ({
        url: `comments/postimages/${imageId}/session/`,
        params: pageParam === null ? undefined : { filters: JSON.stringify({ date__lt: pageParam }) },
      }),
      infiniteQueryOptions: {
        initialPageParam: null,
        // Внутри страницы комментарии от старых к новым — самый старый первый.
        getNextPageParam: (lastPage) =>
          lastPage.after_exist && lastPage.comments.length ? lastPage.comments[0]?.dt : undefined,
      },
    }),

    /**
     * Публикация: multipart с полями content, reply_to и images (файлы, до 3).
     * Ответ 201 { success, comment } — полный комментарий с сохранёнными картинками.
     */
    postComment: build.mutation<ApiComment, PostCommentArg>({
      query: ({ imageId, html, images, replyTo }) => {
        const body = new FormData();
        body.append("content", html);
        if (replyTo !== null) body.append("reply_to", String(replyTo));
        for (const file of images) body.append("images", file);
        return { url: `comments/postimages/${imageId}/session/`, method: "POST", body };
      },
      transformResponse: (response: { success: boolean; comment: ApiComment }) => response.comment,
    }),

    /**
     * PATCH /comment/<id>/session/ — multipart: content, keep_images (по одному id на поле —
     * какие из прикреплённых картинок оставить), images (новые файлы). Всего картинок до 3.
     * Ответ { success, comment }; в сокет приходит change_comment.
     */
    editComment: build.mutation<ApiComment, { commentId: number; html: string; images: File[]; keepImages: number[] }>({
      query: ({ commentId, html, images, keepImages }) => {
        const body = new FormData();
        body.append("content", html);
        for (const id of keepImages) body.append("keep_images", String(id));
        for (const file of images) body.append("images", file);
        return { url: `comment/${commentId}/session/`, method: "PATCH", body };
      },
      transformResponse: (response: { success: boolean; comment: ApiComment }) => response.comment,
    }),

    /**
     * Жалоба: POST /support/task/session/ в multipart (JSON ручка не принимает).
     * Поля: content_type=comment, object_id, text; гостю обязателен email.
     * Ответ 200 { msg: "ok", id: <object_id> }. Бэк поля не проверяет — проверяем мы.
     */
    reportComment: build.mutation<void, { commentId: number; text: string; email: string | null }>({
      query: ({ commentId, text, email }) => {
        const body = new FormData();
        body.append("content_type", "comment");
        body.append("object_id", String(commentId));
        body.append("text", text);
        if (email !== null) body.append("email", email);
        return { url: "support/task/session/", method: "POST", body };
      },
    }),

    /**
     * Лайк комментария: POST /like/session/comment/<id>/ — та же ручка, что у картинок.
     * Переключает лайк и отвечает { msg: "ok" } без итога, поэтому кэш меняем сразу
     * и откатываем при ошибке.
     */
    toggleCommentLike: build.mutation<void, { imageId: number; commentId: number; userId: number }>({
      query: ({ commentId }) => ({ url: `like/session/comment/${commentId}/`, method: "POST" }),
      async onQueryStarted({ imageId, commentId, userId }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          commentsApi.util.updateQueryData("getComments", imageId, (draft) => {
            const toggle = (likes: number[]) => {
              const index = likes.indexOf(userId);
              if (index === -1) likes.push(userId);
              else likes.splice(index, 1);
            };
            for (const page of draft.pages) {
              for (const comment of page.comments) {
                if (comment.id === commentId) return toggle(comment.likes);
                const reply = comment.reply.find((item) => item.id === commentId);
                if (reply) return toggle(reply.likes);
              }
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),

    /** DELETE /comment/<id>/session/ → { msg: "ok" }. В сокет приходит remove_comment. */
    deleteComment: build.mutation<void, number>({
      query: (commentId) => ({ url: `comment/${commentId}/session/`, method: "DELETE" }),
    }),
  }),
});

export const { useGetCommentsInfiniteQuery, useToggleCommentLikeMutation } = commentsApi;
