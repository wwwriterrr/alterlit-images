import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useGetCommentsInfiniteQuery } from "../../api/commentsApi";
import type { ApiReply, ApiUser } from "../../types/api";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { editStarted, noticeShown, replyCancelled, reportStarted, type ReplyTarget } from "../viewer/viewerSlice";
import { commentRights } from "./editWindow";
import { deleteComment } from "./deleteComment";
import { CommentItem } from "./CommentItem";
import { useCommentsSocket } from "./useCommentsSocket";

interface Props {
  imageId: number;
  viewer: ApiUser | null;
  onReply?: (target: ReplyTarget) => void;
  /** Прокручиваемый контейнер комментариев — чтобы держать позицию при подгрузке. */
  scrollRef: RefObject<HTMLElement | null>;
}

/**
 * Список комментариев: как в мессенджере, новые внизу, у поля ввода.
 * Сверху — кнопка «Показать более ранние».
 */
export function CommentsList({ imageId, viewer, onReply, scrollRef }: Props) {
  const dispatch = useAppDispatch();
  const viewerId = viewer?.id ?? null;
  const replyTo = useAppSelector((state) => state.viewer.replyTo);
  const editingId = useAppSelector((state) => state.viewer.editing?.commentId ?? null);
  const onCancelReply = () => dispatch(replyCancelled());
  const rightsFor = (comment: ApiReply) => commentRights(comment, viewer);
  const onEdit = (comment: ApiReply, deadline: number | null) =>
    dispatch(editStarted({ commentId: comment.id, html: comment.content ?? "", images: comment.images, deadline }));
  const onDelete = async (commentId: number) => {
    try {
      await dispatch(deleteComment(imageId, commentId));
    } catch (error) {
      dispatch(noticeShown(error instanceof Error ? error.message : "Не получилось удалить комментарий."));
      throw error;
    }
  };
  const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, isFetchNextPageError } =
    useGetCommentsInfiniteQuery(imageId);

  // Новые, изменённые и удалённые комментарии приходят через сокет.
  useCommentsSocket(imageId, () => void refetch());

  // Страницы приходят от новых к старым, внутри страницы — от старых к новым.
  const comments = data ? [...data.pages].reverse().flatMap((page) => page.comments) : [];

  // При первой загрузке — к последним комментариям. Если контейнер не прокручивается
  // сам (на телефоне листается весь диалог), ничего не трогаем.
  const scrolledInitially = useRef(false);
  // Список «прилип» к низу: держим его там, когда что-то меняет размеры — догрузилась
  // форма под ним, проявилась картинка в комментарии.
  const stickToBottom = useRef(false);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || scrolledInitially.current || !comments.length) return;
    scrolledInitially.current = true;
    if (getComputedStyle(el).overflowY === "auto") {
      el.scrollTop = el.scrollHeight;
      stickToBottom.current = true;
    }
  }, [comments.length, scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    const list = el?.querySelector(".il-comment-list");
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
    };
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    if (list) observer.observe(list);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef, comments.length > 0]);

  // При подгрузке ранних комментариев сверху держим на месте то, что сейчас на экране:
  // запоминаем, где стоял первый комментарий, и после подгрузки возвращаем его туда же.
  // Расстояние до низа списка для этого не годится — у короткого списка под ним пустое
  // место, а кнопка «Показать более ранние» после последней порции исчезает.
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const loadEarlier = () => {
    const el = scrollRef.current;
    const first = el?.querySelector<HTMLElement>(".il-comment-list > [data-comment-id]");
    // offset — где комментарий виден внутри блока: позиция в содержимом минус прокрутка.
    anchor.current = el && first ? { id: first.dataset.commentId!, offset: offsetWithin(first, el) - el.scrollTop } : null;
    // Пользователь листает к ранним — к низу больше не прилипаем.
    stickToBottom.current = false;
    void fetchNextPage();
  };
  const pageCount = data?.pages.length ?? 0;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const saved = anchor.current;
    if (!el || !saved) return;
    anchor.current = null;
    const same = el.querySelector<HTMLElement>(`.il-comment-list > [data-comment-id="${saved.id}"]`);
    if (same) el.scrollTop = offsetWithin(same, el) - saved.offset;
  }, [pageCount, scrollRef]);

  if (isLoading) {
    return (
      <ul className="il-comment-list" aria-busy="true" aria-label="Загружаем комментарии">
        {[0, 1, 2].map((i) => (
          <li key={i} className="il-comment il-comment--skeleton" aria-hidden="true">
            <div className="il-comment__inner">
              <span className="il-avatar il-skeleton" />
              <div className="il-comment__main">
                <span className="il-skeleton il-skeleton__line" />
                <span className="il-skeleton il-skeleton__line il-skeleton__line--wide" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (isError) {
    return (
      <div className="il-comments__state" role="alert">
        <p>Не удалось загрузить комментарии.</p>
        <button className="il-text-button" type="button" onClick={() => void refetch()}>
          Загрузить снова
        </button>
      </div>
    );
  }

  if (!comments.length) return <p className="il-comments__empty">Комментариев пока нет.</p>;

  return (
    <>
      {hasNextPage && (
        <button className="il-text-button il-comments__earlier" type="button" onClick={loadEarlier} disabled={isFetchingNextPage}>
          {isFetchingNextPage
            ? "Загружаем…"
            : isFetchNextPageError
              ? "Не удалось загрузить. Попробовать ещё раз"
              : "Предыдущие комментарии"}
        </button>
      )}
      <ul className="il-comment-list">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            viewerId={viewerId}
            onReply={onReply}
            onCancelReply={onCancelReply}
            replyTo={replyTo}
            editingId={editingId}
            rightsFor={rightsFor}
            onDelete={onDelete}
            onEdit={onEdit}
            onReport={(id) => dispatch(reportStarted(id))}
          />
        ))}
      </ul>
    </>
  );
}

/** Позиция элемента внутри прокручиваемого блока — без учёта прокрутки и положения на экране. */
function offsetWithin(element: HTMLElement, container: HTMLElement): number {
  return element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}
