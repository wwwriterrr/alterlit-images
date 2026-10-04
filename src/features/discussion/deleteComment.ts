import type { AppDispatch } from "../../app/store";
import { commentsApi } from "../../api/commentsApi";
import { removeComment } from "./commentsCache";
import { sendErrorMessage } from "./sendComment";

/**
 * Удаление: ждём ответа сервера и убираем комментарий из списка. Событие
 * remove_comment из сокета может прийти раньше или позже — повторное удаление
 * уже отсутствующего комментария ничего не делает.
 */
export function deleteComment(imageId: number, commentId: number) {
  return async (dispatch: AppDispatch): Promise<void> => {
    try {
      await dispatch(commentsApi.endpoints.deleteComment.initiate(commentId)).unwrap();
    } catch (error) {
      const message = sendErrorMessage(error);
      throw new Error(message.startsWith("Комментарий не отправился") ? "Не получилось удалить комментарий. Попробуйте ещё раз." : message);
    }
    dispatch(removeComment(imageId, commentId));
  };
}
