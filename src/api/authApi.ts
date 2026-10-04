import { baseApi } from "./baseApi";
import type { ApiUser } from "../types/api";

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * Текущий пользователь или null, если он не вошёл: на анонима бэк
     * отвечает 403 «Authentication credentials were not provided».
     */
    getSessionUser: build.query<ApiUser | null, void>({
      async queryFn(_arg, _api, _extra, baseQuery) {
        const result = await baseQuery("users/session/self/");
        if (result.error?.status === 401 || result.error?.status === 403) return { data: null };
        if (result.error) return { error: result.error };
        return { data: result.data as ApiUser };
      },
      providesTags: ["Session"],
    }),
  }),
});

export const { useGetSessionUserQuery } = authApi;
