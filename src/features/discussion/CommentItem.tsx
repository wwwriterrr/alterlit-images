import { useMemo, useState } from "react";
import type { ApiComment, ApiReply } from "../../types/api";
import type { ReplyTarget } from "../viewer/viewerSlice";
import { formatSecondsLeft, useSecondsLeft, type CommentRights } from "./editWindow";
import { Avatar, HEART_PATH, ProgressiveImage, authorName, profileUrl } from "../feed/parts";
import { formatCommentDate, plural } from "./format";
import { sanitizeComment } from "./sanitize";

/** Сколько ответов видно сразу; остальные — по кнопке. Как REPLY_COUNT на бэке. */
const VISIBLE_REPLIES = 3;

interface ItemProps {
  comment: ApiComment;
  viewerId: number | null;
  /** Нет — пользователь не вошёл, кнопки «Ответить» не будет. */
  onReply?: (target: ReplyTarget) => void;
  /** Что пользователь может сделать с комментарием и до какого момента. */
  rightsFor: (comment: ApiReply) => CommentRights;
  /** Удалить; бросает Error с текстом для пользователя. */
  onDelete: (commentId: number) => Promise<void>;
  /** Начать правку в нижней форме. */
  onEdit: (comment: ApiReply, deadline: number | null) => void;
}

export function CommentItem({ comment, viewerId, onReply, rightsFor, onDelete, onEdit }: ItemProps) {
  const [showAll, setShowAll] = useState(false);
  const hidden = comment.reply.length - VISIBLE_REPLIES;
  const replies = showAll || hidden <= 0 ? comment.reply : comment.reply.slice(0, VISIBLE_REPLIES);

  return (
    <li className="il-comment" data-comment-id={comment.id}>
      <CommentBody
        comment={comment}
        viewerId={viewerId}
        threadId={comment.id}
        onReply={onReply}
        rights={rightsFor(comment)}
        onDelete={onDelete}
        onEdit={onEdit}
      />
      {comment.reply.length > 0 && (
        <ul className="il-replies" aria-label="Ответы">
          {replies.map((reply) => (
            <li key={reply.id} className="il-comment il-comment--reply">
              {/* Ответ на ответ уходит в ту же ветку: вложенность только второго уровня. */}
              <CommentBody
                comment={reply}
                viewerId={viewerId}
                threadId={comment.id}
                onReply={onReply}
                rights={rightsFor(reply)}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            </li>
          ))}
          {!showAll && hidden > 0 && (
            <li>
              <button className="il-text-button" type="button" onClick={() => setShowAll(true)}>
                Показать ещё {hidden} {plural(hidden, ["ответ", "ответа", "ответов"])}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function CommentBody({
  comment,
  viewerId,
  threadId,
  onReply,
  rights,
  onDelete,
  onEdit,
}: {
  comment: ApiReply;
  viewerId: number | null;
  /** id верхнего комментария ветки — на него и уходит ответ. */
  threadId: number;
  onReply?: (target: ReplyTarget) => void;
  rights: CommentRights;
  onDelete: (commentId: number) => Promise<void>;
  onEdit: (comment: ApiReply, deadline: number | null) => void;
}) {
  // Окно правки тикает только у своих свежих комментариев; на нуле кнопки пропадают.
  const secondsLeft = useSecondsLeft(rights.deadline);
  const expired = secondsLeft === 0;
  const canEdit = rights.canEdit && !expired;
  const canDelete = rights.canDelete && !expired;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    setDeleting(true);
    try {
      await onDelete(comment.id);
    } catch {
      // Сообщение покажет onDelete; комментарий остаётся на месте.
      setDeleting(false);
      setConfirming(false);
    }
  };
  const name = authorName(comment.author);
  const html = useMemo(() => (comment.content ? sanitizeComment(comment.content) : ""), [comment.content]);
  const liked = viewerId !== null && comment.likes.includes(viewerId);

  return (
    <article className="il-comment__inner" data-pending={comment.pending || deleting || undefined}>
      <a className="il-comment__avatar" href={profileUrl(comment.author.username)} tabIndex={-1} aria-hidden="true">
        <Avatar src={comment.author.avatar} name={name} />
      </a>
      <div className="il-comment__main">
        <div className="il-comment__head">
          <a className="il-comment__author" href={profileUrl(comment.author.username)}>
            {name}
          </a>
          {comment.pending ? (
            <span className="il-comment__date" role="status">
              Отправляется…
            </span>
          ) : (
            <time className="il-comment__date" dateTime={comment.dt}>
              {formatCommentDate(comment.dt)}
            </time>
          )}
          {comment.dt_modified && <span className="il-comment__edited">изменён</span>}
        </div>

        {html && <div className="il-comment__text" dangerouslySetInnerHTML={{ __html: html }} />}

        {comment.images.length > 0 && (
          <ul className="il-comment__images">
            {comment.images.map((image) => (
              <li key={image.id}>
                <a className="il-comment__image" href={image.url} target="_blank" rel="noopener" aria-label="Открыть картинку из комментария">
                  <ProgressiveImage preview={image.preview} full={image.url} lazy />
                </a>
              </li>
            ))}
          </ul>
        )}

        {(comment.likes.length > 0 || ((onReply || canEdit || canDelete) && !comment.pending)) && (
          <div className="il-comment__foot">
            {comment.likes.length > 0 && (
            <span
              className="il-comment__likes"
              data-mine={liked || undefined}
              aria-label={`${comment.likes.length} ${plural(comment.likes.length, ["лайк", "лайка", "лайков"])}`}
            >
              <svg viewBox="0 0 40 40" aria-hidden="true">
                <path d={HEART_PATH} />
              </svg>
              {comment.likes.length}
            </span>
            )}
            {confirming ? (
              <span className="il-comment__confirm" role="group" aria-label="Подтверждение удаления">
                <span>Удалить комментарий?</span>
                <button className="il-text-button il-comment__action il-comment__action--danger" type="button" onClick={() => void remove()} disabled={deleting}>
                  {deleting ? "Удаляем…" : "Удалить"}
                </button>
                {!deleting && (
                  <button className="il-text-button il-comment__action" type="button" onClick={() => setConfirming(false)}>
                    Отмена
                  </button>
                )}
              </span>
            ) : (
              <>
                {onReply && !comment.pending && (
                  <button
                    className="il-text-button il-comment__action"
                    type="button"
                    onClick={() => onReply({ commentId: threadId, username: comment.author.username, name })}
                  >
                    Ответить
                  </button>
                )}
                {canEdit && (
                  <button className="il-text-button il-comment__action" type="button" onClick={() => onEdit(comment, rights.deadline)}>
                    Изменить
                  </button>
                )}
                {canDelete && (
                  <button className="il-text-button il-comment__action" type="button" onClick={() => setConfirming(true)}>
                    Удалить
                  </button>
                )}
                {(canEdit || canDelete) && secondsLeft !== null && (
                  <span
                    className="il-comment__timer"
                    title="Время, за которое можно изменить или удалить комментарий. После этого кнопки пропадут."
                    aria-label={`Осталось ${formatSecondsLeft(secondsLeft)}, чтобы изменить или удалить комментарий`}
                  >
                    {formatSecondsLeft(secondsLeft)}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
