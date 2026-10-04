/** Пользователь в ответах бэка: и `users/session/self/`, и автор картинки. */
export interface ApiUser {
  id: number;
  name: string;
  /** Путь от корня сайта, например `/media/avatars/….jpg`. */
  avatar: string | null;
  is_staff: boolean;
  username: string;
  groups: string[];
}

export interface ApiImage {
  id: number;
  /** Оригинал, путь от корня сайта. */
  url: string;
  /** Уменьшенная копия для ленты. */
  preview: string;
  author: ApiUser;
  /** id пользователей, лайкнувших картинку. */
  likes: number[];
  /** Количество комментариев. */
  comments: number;
}

/**
 * `images/session/` отдаёт по 21 картинке, от новых к старым.
 * Следующая порция — тот же запрос с `last_id` = id последней картинки.
 * Если картинок не нашлось (неизвестный slug или `last_id` за концом ленты),
 * бэк отвечает 404.
 */
export interface ApiImagesPage {
  msg: string;
  images: ApiImage[];
  /** Есть ли картинки дальше. */
  after: boolean;
}

/** Картинка, прикреплённая к комментарию. preview — тот же размытый квадрат 60×60. */
export interface ApiCommentImage {
  id: number;
  url: string;
  preview: string;
}

/** Ответ на комментарий. Вложенность только одного уровня. */
export interface ApiReply {
  id: number;
  /** ISO без часового пояса: "2026-09-16T19:28:08.266706". */
  dt: string;
  dt_modified: string | null;
  author: ApiUser;
  /** HTML. null — комментарий из одной картинки. */
  content: string | null;
  images: ApiCommentImage[];
  /** id пользователей, лайкнувших комментарий. */
  likes: number[];
  /** id родительского комментария. */
  on_comment?: number | null;
  /** Только на клиенте: комментарий показан сразу, но сервер его ещё не подтвердил. */
  pending?: true;
}

export interface ApiComment extends ApiReply {
  /** Ответы, от старых к новым. */
  reply: ApiReply[];
}

/**
 * comments/<type>/<id>/session/ отдаёт `limit` самых новых комментариев, но внутри
 * страницы — от старых к новым. after_exist — есть ли ещё более старые.
 */
export interface ApiCommentsPage {
  success: boolean;
  comments: ApiComment[];
  after_exist: boolean;
}
