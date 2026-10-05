import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/** На какой комментарий отвечаем: id верхнего комментария ветки и кого упомянуть. */
export interface ReplyTarget {
  /** id верхнего комментария ветки — он уходит в reply_to. */
  commentId: number;
  /** id комментария, у которого нажали «Ответить» (может быть ответом в ветке). */
  sourceId: number;
  username: string;
  name: string;
}

/** Какой комментарий правим в нижней форме. */
export interface EditTarget {
  commentId: number;
  html: string;
  images: { id: number; url: string; preview: string }[];
  /** До какого момента можно сохранить (мс); null — без ограничения (staff). */
  deadline: number | null;
}

interface ViewerState {
  /** Какая картинка открыта в диалоге. Саму картинку берём из кэша ленты по id. */
  openImageId: number | null;
  /** Текст окна-предупреждения; null — окно закрыто. */
  notice: string | null;
  replyTo: ReplyTarget | null;
  editing: EditTarget | null;
  /** id комментария, на который открыто окно жалобы. */
  reportingId: number | null;
}

const initialState: ViewerState = { openImageId: null, notice: null, replyTo: null, editing: null, reportingId: null };

const viewerSlice = createSlice({
  name: "viewer",
  initialState,
  reducers: {
    imageOpened(state, action: PayloadAction<number>) {
      state.openImageId = action.payload;
      state.replyTo = null;
      state.editing = null;
      state.reportingId = null;
    },
    imageClosed(state) {
      state.openImageId = null;
      state.replyTo = null;
      state.editing = null;
      state.reportingId = null;
    },
    replyStarted(state, action: PayloadAction<ReplyTarget>) {
      state.replyTo = action.payload;
      state.editing = null;
    },
    editStarted(state, action: PayloadAction<EditTarget>) {
      state.editing = action.payload;
      state.replyTo = null;
    },
    editCancelled(state) {
      state.editing = null;
    },
    reportStarted(state, action: PayloadAction<number>) {
      state.reportingId = action.payload;
    },
    reportClosed(state) {
      state.reportingId = null;
    },
    replyCancelled(state) {
      state.replyTo = null;
    },
    noticeShown(state, action: PayloadAction<string>) {
      state.notice = action.payload;
    },
    noticeClosed(state) {
      state.notice = null;
    },
  },
});

export const { imageOpened, imageClosed, replyStarted, replyCancelled, editStarted, editCancelled, reportStarted, reportClosed, noticeShown, noticeClosed } = viewerSlice.actions;
export default viewerSlice.reducer;
