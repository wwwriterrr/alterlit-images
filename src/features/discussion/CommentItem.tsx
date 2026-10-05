import { useMemo, useState } from "react";
import type { ApiComment, ApiReply } from "../../types/api";
import type { ReplyTarget } from "../viewer/viewerSlice";
import { formatSecondsLeft, useSecondsLeft, type CommentRights } from "./editWindow";
import { Avatar, HEART_PATH, authorName, profileUrl } from "../feed/parts";
import { formatCommentDate, plural } from "./format";
import { sanitizeComment } from "./sanitize";

/**
 * Комментарий в виде, как в комментариях на страницах текстов сайта
 * (остров /assets/comments/): аватар, имя и дата, текст, картинки, строка иконок,
 * ответы свёрнуты за «Показать ответы (N)».
 */

interface ItemProps {
  comment: ApiComment;
  viewerId: number | null;
  /** Нет — пользователь не вошёл, кнопки «Ответить» не будет. */
  onReply?: (target: ReplyTarget) => void;
  onCancelReply: () => void;
  /** На какой комментарий сейчас пишется ответ. */
  replyTo: ReplyTarget | null;
  /** Какой комментарий сейчас правится в форме. */
  editingId: number | null;
  /** Что пользователь может сделать с комментарием и до какого момента. */
  rightsFor: (comment: ApiReply) => CommentRights;
  /** Удалить; бросает Error с текстом для пользователя. */
  onDelete: (commentId: number) => Promise<void>;
  /** Начать правку в нижней форме. */
  onEdit: (comment: ApiReply, deadline: number | null) => void;
  /** Пожаловаться — доступно и гостям; на свои комментарии кнопки нет. */
  onReport: (commentId: number) => void;
  /** Переключить лайк; true — переключается (гостю вместо этого покажут окно). */
  onLike: (commentId: number) => boolean;
}

export function CommentItem({ comment, replyTo, ...rest }: ItemProps) {
  const [open, setOpen] = useState(false);
  // Ветку раскрываем сами, если в ней отвечают или в ней «отправляется» ответ.
  const forcedOpen = replyTo?.commentId === comment.id || comment.reply.some((reply) => reply.pending);
  const showReplies = open || forcedOpen;
  const count = comment.reply.length;

  return (
    <li className="il-comment" data-comment-id={comment.id}>
      <CommentBody comment={comment} threadId={comment.id} replyTo={replyTo} {...rest} />

      {count > 0 && (
        <div className="il-comment__thread">
          {!forcedOpen && (
            <button className="il-comment__toggle" type="button" aria-expanded={showReplies} onClick={() => setOpen(!open)}>
              {showReplies ? "Скрыть ответы" : `Показать ответы (${count})`}
            </button>
          )}
          {showReplies && (
            <ul className="il-replies" aria-label="Ответы">
              {comment.reply.map((reply) => (
                <li key={reply.id} className="il-comment il-comment--reply">
                  {/* Ответ на ответ уходит в ту же ветку: вложенность только второго уровня. */}
                  <CommentBody comment={reply} threadId={comment.id} replyTo={replyTo} {...rest} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function CommentBody({
  comment,
  viewerId,
  threadId,
  onReply,
  onCancelReply,
  replyTo,
  editingId,
  rightsFor,
  onDelete,
  onEdit,
  onReport,
  onLike,
}: Omit<ItemProps, "comment"> & {
  comment: ApiReply;
  /** id верхнего комментария ветки — на него и уходит ответ. */
  threadId: number;
}) {
  const rights = rightsFor(comment);
  // Окно правки тикает только у своих свежих комментариев; на нуле кнопки пропадают.
  const secondsLeft = useSecondsLeft(rights.deadline);
  const expired = secondsLeft === 0;
  const canEdit = rights.canEdit && !expired;
  const canDelete = rights.canDelete && !expired;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pulse, setPulse] = useState<"in" | "out" | null>(null);
  const name = authorName(comment.author);
  const html = useMemo(() => (comment.content ? sanitizeComment(comment.content) : ""), [comment.content]);
  const liked = viewerId !== null && comment.likes.includes(viewerId);
  const replyingHere = replyTo?.sourceId === comment.id;
  const isOwn = viewerId !== null && comment.author.id === viewerId;
  const editingHere = editingId === comment.id;

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

  return (
    <article className="il-comment__inner" data-pending={comment.pending || deleting || undefined} data-active={replyingHere || editingHere || undefined}>
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
          {comment.dt_modified && <span className="il-comment__date">изменён</span>}
        </div>

        {comment.images.length > 0 && (
          <div className="il-comment__images">
            {comment.images.map((image) => (
              <a key={image.id} className="il-comment__image" href={image.url} target="_blank" rel="noopener" aria-label="Открыть картинку из комментария">
                <img src={image.url} alt="" loading="lazy" decoding="async" />
              </a>
            ))}
          </div>
        )}

        {html && <div className="il-comment__text" dangerouslySetInnerHTML={{ __html: html }} />}

        {!comment.pending && (
          <div className="il-comment__manage">
            {confirming ? (
              <span className="il-comment__confirm" role="group" aria-label="Подтверждение удаления">
                <span>Удалить комментарий?</span>
                <button className="il-comment__link il-comment__link--danger" type="button" onClick={() => void remove()} disabled={deleting}>
                  {deleting ? "Удаляем…" : "Удалить"}
                </button>
                {!deleting && (
                  <button className="il-comment__link" type="button" onClick={() => setConfirming(false)}>
                    Отмена
                  </button>
                )}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="il-comment__likes"
                  data-mine={liked || undefined}
                  data-pulse={pulse ?? undefined}
                  aria-pressed={liked}
                  aria-label={`Нравится: ${comment.likes.length} ${plural(comment.likes.length, ["лайк", "лайка", "лайков"])}`}
                  onClick={() => {
                    if (onLike(comment.id)) setPulse(liked ? "out" : "in");
                  }}
                  onAnimationEnd={() => setPulse(null)}
                >
                  <svg viewBox="0 0 40 40" width="26" height="26" aria-hidden="true">
                    <path d={HEART_PATH} />
                  </svg>
                  {comment.likes.length > 0 && <span>{comment.likes.length}</span>}
                </button>
                {onReply &&
                  (replyingHere ? (
                    <IconButton title="Отменить ответ" onClick={onCancelReply}>
                      <CrossIcon />
                    </IconButton>
                  ) : (
                    <IconButton title="Ответить" onClick={() => onReply({ commentId: threadId, sourceId: comment.id, username: comment.author.username, name })}>
                      <ReplyIcon />
                    </IconButton>
                  ))}
                {!isOwn && (
                  <IconButton title="Пожаловаться" onClick={() => onReport(comment.id)}>
                    <ReportIcon />
                  </IconButton>
                )}
                {canEdit && (
                  <IconButton title="Редактировать" onClick={() => onEdit(comment, rights.deadline)} pressed={editingHere}>
                    <EditIcon />
                  </IconButton>
                )}
                {canDelete && (
                  <IconButton title="Удалить" onClick={() => setConfirming(true)}>
                    <DeleteIcon />
                  </IconButton>
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

function IconButton({ title, onClick, pressed, children }: { title: string; onClick: () => void; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button className="il-comment__icon" type="button" title={title} aria-label={title} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

/* Иконки — те же, что у комментариев сайта, с их цветами. */

function ReplyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.5556 21V15.8571C20.5556 14.7857 20.1991 13.875 19.4861 13.125C18.7731 12.375 17.9074 12 16.8889 12H5.675L10.075 16.6286L8.33333 18.4286L1 10.7143L8.33333 3L10.075 4.8L5.675 9.42857H16.8889C18.5796 9.42857 20.021 10.0556 21.2131 11.3096C22.4052 12.5636 23.0008 14.0794 23 15.8571V21H20.5556Z"
        fill="#bbb7a7"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" stroke="#bbb7a7" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 1C18.0753 1 23 5.9247 23 12C23 18.0753 18.0753 23 12 23C5.9247 23 1 18.0753 1 12C1 5.9247 5.9247 1 12 1ZM12 3.2C9.66609 3.2 7.42778 4.12714 5.77746 5.77746C4.12714 7.42778 3.2 9.66609 3.2 12C3.2 14.3339 4.12714 16.5722 5.77746 18.2225C7.42778 19.8729 9.66609 20.8 12 20.8C14.3339 20.8 16.5722 19.8729 18.2225 18.2225C19.8729 16.5722 20.8 14.3339 20.8 12C20.8 9.66609 19.8729 7.42778 18.2225 5.77746C16.5722 4.12714 14.3339 3.2 12 3.2ZM12 15.3C12.2917 15.3 12.5715 15.4159 12.7778 15.6222C12.9841 15.8285 13.1 16.1083 13.1 16.4C13.1 16.6917 12.9841 16.9715 12.7778 17.1778C12.5715 17.3841 12.2917 17.5 12 17.5C11.7083 17.5 11.4285 17.3841 11.2222 17.1778C11.0159 16.9715 10.9 16.6917 10.9 16.4C10.9 16.1083 11.0159 15.8285 11.2222 15.6222C11.4285 15.4159 11.7083 15.3 12 15.3ZM12 5.4C12.2917 5.4 12.5715 5.51589 12.7778 5.72218C12.9841 5.92847 13.1 6.20826 13.1 6.5V13.1C13.1 13.3917 12.9841 13.6715 12.7778 13.8778C12.5715 14.0841 12.2917 14.2 12 14.2C11.7083 14.2 11.4285 14.0841 11.2222 13.8778C11.0159 13.6715 10.9 13.3917 10.9 13.1V6.5C10.9 6.20826 11.0159 5.92847 11.2222 5.72218C11.4285 5.51589 11.7083 5.4 12 5.4Z"
        fill="#bbb7a7"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5.79333 16.3903L17.0622 5.21783L15.4911 3.66015L4.22222 14.8327V16.3903H5.79333ZM6.71444 18.5936H2V13.9194L14.7056 1.32254C14.9139 1.11602 15.1965 1 15.4911 1C15.7857 1 16.0683 1.11602 16.2767 1.32254L19.42 4.43899C19.6283 4.64557 19.7453 4.92572 19.7453 5.21783C19.7453 5.50993 19.6283 5.79008 19.42 5.99666L6.71444 18.5936ZM2 20.7968H22V23H2V20.7968Z"
        fill="#0079f0"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.78571 5.125V3.0625H15.2143V5.125H8.78571ZM6.64286 5.125V2.375C6.64286 2.01033 6.79337 1.66059 7.06128 1.40273C7.32919 1.14487 7.69255 1 8.07143 1H15.9286C16.3075 1 16.6708 1.14487 16.9387 1.40273C17.2066 1.66059 17.3571 2.01033 17.3571 2.375V5.125H20.9286C21.2127 5.125 21.4853 5.23365 21.6862 5.42705C21.8871 5.62044 22 5.88275 22 6.15625C22 6.42975 21.8871 6.69206 21.6862 6.88545C21.4853 7.07885 21.2127 7.1875 20.9286 7.1875H20.4071L19.3457 20.4604C19.2906 21.1512 18.9666 21.7966 18.4385 22.2675C17.9104 22.7383 17.217 23 16.4971 23H7.50286C6.78297 23 6.08963 22.7383 5.56149 22.2675C5.03336 21.7966 4.70936 21.1512 4.65429 20.4604L3.59286 7.1875H3.07143C2.78727 7.1875 2.51475 7.07885 2.31381 6.88545C2.11288 6.69206 2 6.42975 2 6.15625C2 5.88275 2.11288 5.62044 2.31381 5.42705C2.51475 5.23365 2.78727 5.125 3.07143 5.125H6.64286ZM5.74286 7.1875H18.2571L17.2086 20.3023C17.1949 20.4749 17.114 20.6362 16.9821 20.754C16.8503 20.8718 16.677 20.9373 16.4971 20.9375H7.50286C7.32295 20.9373 7.14975 20.8718 7.01785 20.754C6.88596 20.6362 6.8051 20.4749 6.79143 20.3023L5.74286 7.1875Z"
        fill="#D78778"
      />
    </svg>
  );
}
