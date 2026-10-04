import { lazy } from "react";

/**
 * Форма комментария с редактором живёт в отдельном бандле editor.js: она нужна
 * только вошедшим и только в открытом диалоге, а весит больше всей ленты.
 */
export const loadCommentForm = () => import("../comments/CommentForm");

export const LazyCommentForm = lazy(() => loadCommentForm().then((module) => ({ default: module.CommentForm })));

/** Подгрузить бандл заранее, когда браузер простаивает, — к открытию диалога он уже в кэше. */
export function prefetchCommentForm() {
  const load = () => void loadCommentForm().catch(() => {});
  if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 5000 });
  else setTimeout(load, 2000);
}
