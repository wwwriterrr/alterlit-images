import { useCallback } from "react";
import { useGetSessionUserQuery } from "../../api/authApi";
import { useToggleLikeMutation } from "../../api/likesApi";
import { useAppDispatch } from "../../app/hooks";
import { noticeShown } from "../viewer/viewerSlice";

const GUEST_LIKE_NOTICE = "Ставить реакции могут только авторизованные пользователи. Войдите на сайт, чтобы отметить иллюстрацию.";
const LIKE_FAILED_NOTICE = "Не удалось сохранить реакцию. Проверьте соединение и попробуйте ещё раз.";

/**
 * Обработчик нажатия на сердечко: лайк для вошедших, предупреждение для гостей.
 * Возвращает true, если лайк действительно переключается, — по нему кнопка
 * решает, играть ли анимацию.
 */
export function useLikeAction(slug: string) {
  const dispatch = useAppDispatch();
  const { data: viewer, isLoading } = useGetSessionUserQuery();
  const [toggleLike] = useToggleLikeMutation();

  return useCallback(
    (imageId: number): boolean => {
      // Пока не знаем, кто смотрит, ничего не делаем — иначе гость мог бы
      // увидеть, как сердечко закрасилось и тут же погасло.
      if (isLoading || viewer === undefined) return false;
      if (viewer === null) {
        dispatch(noticeShown(GUEST_LIKE_NOTICE));
        return false;
      }
      toggleLike({ imageId, slug, userId: viewer.id })
        .unwrap()
        .catch(() => dispatch(noticeShown(LIKE_FAILED_NOTICE)));
      return true;
    },
    [dispatch, isLoading, slug, toggleLike, viewer],
  );
}
