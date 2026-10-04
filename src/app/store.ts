import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { baseApi } from "../api/baseApi";
import viewerReducer from "../features/viewer/viewerSlice";

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    viewer: viewerReducer,
  },
  middleware: (getDefault) => getDefault().concat(baseApi.middleware),
});

// Перезапрашивает данные при возврате на вкладку и восстановлении сети.
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
