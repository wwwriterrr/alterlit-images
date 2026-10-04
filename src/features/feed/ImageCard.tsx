import type { MouseEvent } from "react";
import type { ApiImage } from "../../types/api";
import { Avatar, CommentsCount, LikeButton, ProgressiveImage, authorName, profileUrl } from "./parts";

interface Props {
  image: ApiImage;
  /** id текущего пользователя, null — аноним. */
  viewerId: number | null;
  onOpen: (id: number) => void;
  /** Переключить лайк; true — лайк переключается, false — нет (гость). */
  onLike: (id: number) => boolean;
}

export function ImageCard({ image, viewerId, onOpen, onLike }: Props) {
  const name = authorName(image.author);

  // Ссылка остаётся настоящей: средний клик и Ctrl/Cmd+клик открывают оригинал
  // в новой вкладке как обычно, а простой клик открывает диалог.
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(image.id);
  };

  return (
    <article className="il-card">
      <a
        className="il-tile"
        href={image.url}
        onClick={handleClick}
        aria-haspopup="dialog"
        aria-label={`Открыть иллюстрацию автора ${name}`}
      >
        <ProgressiveImage preview={image.preview} full={image.url} lazy />
      </a>
      <div className="il-caption">
        <a className="il-author" href={profileUrl(image.author.username)}>
          <Avatar src={image.author.avatar} name={name} />
          <span className="il-author__name">{name}</span>
        </a>
        <span className="il-stats">
          <LikeButton
            count={image.likes.length}
            mine={viewerId !== null && image.likes.includes(viewerId)}
            onToggle={() => onLike(image.id)}
          />
          <CommentsCount count={image.comments} />
        </span>
      </div>
    </article>
  );
}

export function SkeletonCard() {
  return (
    <div className="il-card" aria-hidden="true">
      <div className="il-tile il-skeleton" />
      <div className="il-caption">
        <span className="il-author">
          <span className="il-avatar il-skeleton" />
          <span className="il-skeleton il-skeleton__line" />
        </span>
        <span className="il-skeleton il-skeleton__line il-skeleton__line--stats" />
      </div>
    </div>
  );
}
