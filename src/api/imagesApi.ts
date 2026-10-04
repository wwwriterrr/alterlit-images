import { baseApi } from "./baseApi";
import type { ApiImagesPage } from "../types/api";

export const imagesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Лента картинок по slug страницы. pageParam — id последней загруженной картинки. */
    getImages: build.infiniteQuery<ApiImagesPage, string, number | null>({
      query: ({ queryArg: slug, pageParam }) => ({
        url: "images/session/",
        params: {
          ...(slug ? { slug } : {}),
          ...(pageParam === null ? {} : { last_id: pageParam }),
        },
      }),
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) =>
          lastPage.after ? (lastPage.images.at(-1)?.id ?? undefined) : undefined,
      },
    }),
  }),
});

export const { useGetImagesInfiniteQuery } = imagesApi;
