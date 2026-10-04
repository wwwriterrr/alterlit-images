import type { AppDispatch } from "../../app/store";
import { commentsApi } from "../../api/commentsApi";
import { updateComment } from "./commentsCache";
import { sendErrorMessage } from "./sendComment";

interface EditArg {
  imageId: number;
  commentId: number;
  html: string;
  /** Новые файлы. */
  images: File[];
  /** id уже прикреплённых картинок, которые остаются. */
  keepImages: number[];
}

/** Сохранить правку. Сокет следом пришлёт change_comment — повторное обновление безвредно. */
export function editComment({ imageId, commentId, html, images, keepImages }: EditArg) {
  return async (dispatch: AppDispatch): Promise<void> => {
    try {
      const saved = await dispatch(commentsApi.endpoints.editComment.initiate({ commentId, html, images, keepImages })).unwrap();
      dispatch(updateComment(imageId, saved));
    } catch (error) {
      const message = sendErrorMessage(error);
      throw new Error(message.startsWith("Комментарий не отправился") ? "Изменения не сохранились. Проверьте соединение и попробуйте ещё раз." : message);
    }
  };
}
