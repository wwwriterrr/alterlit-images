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

    /** DELETE /comment/<id>/session/ → { msg: "ok" }. В сокет приходит remove_comment. */
    deleteComment: build.mutation<void, number>({
      query: (commentId) => ({ url: `comment/${commentId}/session/`, method: "DELETE" }),
    }),
  }),
});

export const { useGetCommentsInfiniteQuery } = commentsApi;
