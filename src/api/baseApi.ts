import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { readCsrfToken } from "../lib/csrf";

/**
 * Остров живёт на том же домене, что и Django, поэтому базовый путь
 * относительный, а сессионная кука едет автоматически с credentials: "include".
 * В режиме разработки /api проксируется на бэк с подставленными куками, см. vite.config.ts.
 */
export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api/v1/",
    credentials: "include",
    prepareHeaders: (headers, { type }) => {
      headers.set("Accept", "application/json");
      if (type === "mutation") {
        const token = readCsrfToken();
        if (token) headers.set("X-CSRFToken", token);
      }
      return headers;
    },
  }),
  tagTypes: ["Session"],
  endpoints: () => ({}),
});
