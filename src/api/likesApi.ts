import { baseApi } from "./baseApi";
import { imagesApi } from "./imagesApi";

interface ToggleLikeArg {
  imageId: number;
  /** Slug ленты — ключ кэша, в котором лежит картинка. */
  slug: string;
  /** id текущего пользователя: его и добавляем в likes / убираем оттуда. */
  userId: number;
}

export const likesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * Переключает лайк: бэк сам ставит его, если не стоял, и снимает, если стоял.
     * Отвечает всегда `{"msg":"ok"}` без итогового состояния, поэтому меняем
     * кэш ленты сразу (оптимистично) и откатываем, если запрос упал.
     */
    toggleLike: build.mutation<void, ToggleLikeArg>({
      query: ({ imageId }) => ({ url: `like/session/postimages/${imageId}/`, method: "POST" }),
      async onQueryStarted({ imageId, slug, userId }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          imagesApi.util.updateQueryData("getImages", slug, (draft) => {
            for (const page of draft.pages) {
              const image = page.images.find((item) => item.id === imageId);
              if (!image) continue;
              const index = image.likes.indexOf(userId);
              if (index === -1) image.likes.push(userId);
              else image.likes.splice(index, 1);
              return;
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
  }),
});

export const { useToggleLikeMutation } = likesApi;
