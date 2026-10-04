import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ApiImage, ApiUser } from "../../types/api";
import { Avatar, CommentsCount, LikeButton, ProgressiveImage, authorName, profileUrl } from "../feed/parts";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { CommentsList } from "../discussion/CommentsList";
import { editComment } from "../discussion/editComment";
import { sendComment, sendErrorMessage } from "../discussion/sendComment";
import { editCancelled, replyCancelled, replyStarted } from "./viewerSlice";
import { LazyCommentForm } from "./lazyCommentForm";
import { FullscreenViewer } from "./FullscreenViewer";

interface Props {
  /** Открытая картинка; null — диалог закрыт. */
  image: ApiImage | null;
  /** Текущий пользователь; null — аноним. */
  viewer: ApiUser | null;
  onClose: () => void;
  onLike: (id: number) => boolean;
}

/**
 * Просмотр картинки поверх ленты. Нативный <dialog> со showModal() сам даёт
 * верхний слой, фон-подложку, ловушку фокуса и закрытие по Esc.
 */
export function ImageDialog({ image, viewer, onClose, onLike }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (image && !dialog.open) {
      dialog.showModal();
      // showModal() фокусирует первый интерактивный элемент — ссылку на автора.
      // Крестик полезнее: с клавиатуры диалог закрывается сразу.
      dialog.querySelector<HTMLElement>(".il-close")?.focus();
    }
    if (!image && dialog.open) dialog.close();
  }, [image]);

  return (
    <dialog
      ref={ref}
      className="il-dialog"
      aria-label={image ? `Иллюстрация автора ${authorName(image.author)}` : undefined}
      // Esc и dialog.close() приходят сюда — синхронизируем стор. React прокидывает
      // close и от вложенных диалогов (просмотр во весь экран) по дереву компонентов,
      // поэтому реагируем только на закрытие самого этого диалога.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // Клик по подложке попадает в сам <dialog>, клик по содержимому — нет.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      {image && <DialogContent
          key={image.id}
          image={image}
          viewer={viewer}
          onClose={() => ref.current?.close()}
          onLike={() => onLike(image.id)}
        />}
    </dialog>
  );
}

function DialogContent({
  image,
  viewer,
  onClose,
  onLike,
}: {
  image: ApiImage;
  viewer: ApiUser | null;
  onClose: () => void;
  onLike: () => boolean;
}) {
  const name = authorName(image.author);
  const liked = viewer !== null && image.likes.includes(viewer.id);
  // Пропорции оригинала узнаём только после загрузки; до неё сцена квадратная, как превью.
  const [ratio, setRatio] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const commentsRef = useRef<HTMLElement>(null);
  const dispatch = useAppDispatch();
  const replyTo = useAppSelector((state) => state.viewer.replyTo);
  const editing = useAppSelector((state) => state.viewer.editing);

  const submit = async ({ html, images, keepImages }: { html: string; images: File[]; keepImages: number[] }) => {
    if (!viewer) return;
    if (editing) {
      // editComment сам бросает Error с понятным текстом
      await dispatch(editComment({ imageId: image.id, commentId: editing.commentId, html, images, keepImages }));
      dispatch(editCancelled());
      return;
    }
    try {
      await dispatch(sendComment({ imageId: image.id, html, images, replyTo: replyTo?.commentId ?? null, author: viewer }));
      dispatch(replyCancelled());
    } catch (error) {
      // Форма покажет текст и вернёт в поле написанное.
      throw new Error(sendErrorMessage(error));
    }
  };
  const alt = `Иллюстрация автора ${name}`;

  return (
    <>
      <div className="il-stage" style={ratio ? ({ "--il-ratio": ratio } as CSSProperties) : undefined}>
        <ProgressiveImage
          className="il-picture--contain"
          preview={image.preview}
          full={image.url}
          alt={alt}
          onSize={(width, height) => setRatio(width / height)}
        />
      </div>

      <div className="il-panel">
        <div className="il-panel__head">
          <a className="il-panel__author" href={profileUrl(image.author.username)}>
            <Avatar className="il-avatar--large" src={image.author.avatar} name={name} />
            <span className="il-author__name">{name}</span>
          </a>
          <button className="il-close" type="button" onClick={onClose} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="il-panel__actions">
          <span className="il-stats">
            <LikeButton count={image.likes.length} mine={liked} onToggle={onLike} />
            <CommentsCount count={image.comments} />
          </span>
          <span className="il-panel__buttons">
            <button
              className="il-icon-button"
              type="button"
              onClick={() => setFullscreen(true)}
              aria-label="Открыть во весь экран"
              title="Во весь экран"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </button>
            {/* Оригинал открывается в новой вкладке, откуда его и сохраняют. */}
            <a className="il-download" href={image.url} target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
              </svg>
              Скачать
            </a>
          </span>
        </div>

        <section ref={commentsRef} className="il-comments" aria-labelledby={`il-comments-${image.id}`}>
          <h2 className="il-comments__title" id={`il-comments-${image.id}`}>
            Комментарии
            {image.comments > 0 && <span className="il-comments__total">{image.comments}</span>}
          </h2>
          <CommentsList
            imageId={image.id}
            viewer={viewer}
            onReply={viewer ? (target) => dispatch(replyStarted(target)) : undefined}
            scrollRef={commentsRef}
          />
        </section>

        {viewer ? (
          <Suspense fallback={<div className="il-comment-form il-comment-form--loading" aria-hidden="true" />}>
            <LazyCommentForm
              onSubmit={submit}
              replyTo={replyTo}
              onCancelReply={() => dispatch(replyCancelled())}
              editing={editing}
              onCancelEdit={() => dispatch(editCancelled())}
            />
          </Suspense>
        ) : (
          <p className="il-comments__guest">Войдите на сайт, чтобы оставить комментарий.</p>
        )}
      </div>

      {fullscreen && (
        <FullscreenViewer preview={image.preview} full={image.url} alt={alt} onClose={() => setFullscreen(false)} />
      )}
    </>
  );
}
