# Бэкенд alterlit.ru: что использует остров

Справка по ручкам, моделям и методам Django, с которыми работает остров.
Код бэкенда прислал владелец проекта; формат ответов проверен запросами к боевому
серверу (дата проверки указана у разделов). Всё работает по сессионной куке
(`alterlitsessionid` + `csrftoken`), в dev её подставляет прокси Vite.

---

## Пользователь

Один и тот же объект приходит в `users/session/self/`, в авторе картинки,
в авторе комментария и в автодополнении:

```ts
{ id: number; name: string; avatar: string | null; is_staff: boolean; username: string; groups: string[] }
```

- `name` — это ник; если пустой, выводим `username` (решение владельца).
- `avatar` бывает заглушкой `/assets/img/noavatar_3.png`.
- В `name` встречаются лишние пробелы (`'  я король кк  Бротан'`) — схлопываем.
- Профиль: `/profile/<username>/`.

## GET /api/v1/users/session/self/

Текущий пользователь. Аноним → **403** `{"detail":"Authentication credentials were not provided."}`.

## GET /api/v1/images/session/?slug=<slug>&last_id=<id>  (проверено 2026-10-02)

```ts
{ msg: "ok"; images: Image[]; after: boolean }   // after — есть ли ещё
Image = { id; url; preview; author: User; likes: number[] /* id лайкнувших */; comments: number }
```

- По 21 картинке, от новых к старым. Следующая страница — `last_id` = id последней.
- Пусто (неизвестный slug, `last_id` за концом) → **404** `{"detail":"Изображений по вашему запросу не найдено"}`.
- `preview` — квадрат 60×60 (~500 байт), `url` — оригинал (100–450 КБ, любые пропорции).
- Без `slug` — общая лента всех картинок.

## POST /api/v1/like/session/postimages/<image_id>/  (проверено 2026-10-02)

Переключает лайк текущего пользователя. Ответ всегда `{"msg":"ok"}` без итогового
состояния. Аноним → 403. ⚠️ На несуществующий id тоже отвечает 200 «ok».

## GET /api/v1/session/autocomplete/users/?q=&limit=&offset=  (проверено 2026-10-03)

```ts
{ objects: User[]; more: boolean }
```

- `limit` по умолчанию 20, максимум 100; `offset` — сдвиг для следующей страницы.
- ⚠️ Баг бэка: любой переданный `limit` или `offset` → **500**
  `'>' / '<' not supported between instances of 'str' and 'int'` (не приводится к int).
  Поэтому limit не передаём, а подгрузка следующих страниц пока падает.
- Старая ручка `/api/v1/autocomplete/users/` — только Bearer, острову не подходит.

## GET /api/v1/comments/<content_type>/<object_id>/session/  (проверено 2026-10-03)

Для картинок `content_type = "postimages"`, `object_id = image.id`.
`object_id = "all"` — комментарии ко всем объектам этого типа.

```ts
{ success: true; comments: Comment[]; after_exist: boolean }
// ошибка → 400 { success: false; details: string }

Comment = {
  id: number;
  dt: string;               // ISO без зоны: "2026-09-16T19:28:08.266706"
  dt_modified: string | null;
  author: User;
  content: string | null;   // HTML; null — комментарий из одной картинки
  images: { id: number; url: string; preview: string }[];
  likes: number[];          // id лайкнувших
  reply: Reply[];           // только у верхнего уровня
}
Reply = Comment без reply, плюс on_comment: number (id родителя)
        и iamges: [] — опечатка-дубль images на бэке, не использовать.
```

Параметры (`CommentFetcher.from_request`):

- `limit` — по умолчанию 10, максимум 100, `"all"` — без ограничения.
- `order_by` — по умолчанию `-date`.
- `filters` — JSON-**объект** (не массив, хотя текст ошибки говорит «array»),
  разрешены только ключи `date__gt` и `date__lt`. Чужой ключ → 400 «Запрещенный фильтр».

Порядок и пагинация (`CommentFetcher.fetch`):

- Берутся `limit` самых **новых** комментариев верхнего уровня (`on_comment = None`,
  `status = published`, `is_banned = False`, текущий сайт), затем список
  **разворачивается** — внутри страницы от старых к новым.
- `after_exist: true` — есть ещё более **старые**. Следующая порция:
  `filters={"date__lt": "<dt самого старого из загруженных>"}`.
- Ответы (`reply`) — все, без лимита, от старых к новым. Вложенность только
  второго уровня: ответ на ответ — тоже `on_comment` верхнего комментария.
- Лайки комментариев и ответов собираются одним запросом (`Like`, `content_type = comment`).

Что встречается в `content` (выборка из 108 комментариев к картинкам):

- теги `p`, `br`, `a`, `div`, `iframe` (вставленные видео);
- упоминания старого редактора: `<a class="link" data-user="<id>" href="/profile/<username>" target="_blank">Имя</a>`;
- обычные ссылки: `<a class="link" href="…" target="_blank">…</a>`.
- ⚠️ HTML пользовательский — перед выводом санитизировать по белому списку.

Счётчик `comments` в ленте картинок совпадает с этой ручкой (исправлено на бэке
2026-10-03; до этого у части картинок счётчик был ненулевой при пустой выдаче).
`content` бывает простым текстом без `<p>` (например, `test comment`).

## POST /api/v1/comments/<content_type>/<object_id>/session/  (проверено 2026-10-03)

Публикация комментария. `multipart/form-data` (JSON со списком id картинок — для старого клиента).

- Поля: `content` (HTML; может быть пустым, если есть картинки), `reply_to` (id комментария,
  необязательно; ответ на ответ бэк переносит в ветку верхнего), `images` — файлы, до 3.
- Заголовки: кука сессии и `X-CSRFToken` (SessionAuthentication проверяет CSRF).
- Ответ **201** `{"success": true, "comment": Comment}` — полный комментарий, картинки уже
  сохранены в `PostImages`. ⚠️ Для ответа `on_comment` в нём нет (вид как у верхнего, `reply: []`).
- Ошибки: 403 (не вошёл / заблокирован), 400 (валидация), 404, 500 — `{"success": false, "details": "…"}`.
- Сразу после создания в сокет приходит `new_comment`, а при картинках — ещё `change_comment`.
- Счётчик `comments` в ленте картинок считает и ответы.

Тестовый комментарий на 162850 от dev-аккаунта: 1968796 (с картинкой) — оставлен для проверок; 1968797, 1968805, 1968806 удалены 2026-10-03.

## /api/v1/comment/<comment_id>/session/  (CommentApiSession)

- **DELETE** (проверено 2026-10-03) → 200 `{"msg":"ok"}`; в сокет приходит `remove_comment`.
  Удаление верхнего комментария уносит и ответы (on_delete=CASCADE).
- **PATCH** — правка. Предложена переделка на multipart (поля `content`, `keep_images` —
  повторяющееся поле с id оставляемых картинок, `images` — новые файлы, до 3) с поддержкой
  legacy JSON (`images` — список id). Ответ `{"success": true, "comment": Comment}`.
  Права: автор в течение 5 минут или модератор (`blog.add_post`).

## WebSocket wss://alterlit.ru/ws/comments/postimages/<image_id>/  (проверено 2026-10-03)

Живые события по комментариям картинки: новые, изменённые, удалённые.

- Django Channels за nginx. Без заголовка `Origin` → **403**; чужой Origin пропускает.
- Гостей пускает (кука сессии не нужна), с сессией тоже работает.
- После подключения молчит, пока нет событий. Сервер сам шлёт протокольный ping
  раз в ~40 с — браузер отвечает автоматически, своих пингов не нужно.
- ⚠️ На **любое** сообщение от клиента закрывает соединение с кодом **1011** —
  клиент ничего не отправляет.
- Сообщения (проверено публикацией 2026-10-03), всегда в обёртке `message`:

  ```jsonc
  // сразу при создании — ещё БЕЗ картинок, без likes и reply;
  // у ответа есть on_comment (id родителя), у верхнего комментария поля нет
  {"message": {"type": "new_comment", "comment": {id, dt, dt_modified, author, content, images: [], on_comment?}}}
  // следом, когда привязались картинки (только если они есть)
  {"message": {"type": "change_comment", "comment": {…, images: [...], likes: []}, "m2m": "post_add"}}
  // удаление: самого комментария в событии нет
  {"message": {"type": "remove_comment", "comment_id": 1968806, "on_comment": 1968796}}
  ```
  ```
- Типы сообщений на бэке (`CHANNELS_MESSAGE_TYPES`), к комментариям относятся:
  `new_comment`, `change_comment`, `remove_comment`, `like_comment`, `dislike_comment`.
  Лайки комментариев через сокет пока не отправляются (2026-10-03).
  (`new_notification`, `change_balance` — другие каналы.)
- В dev сокет идёт через прокси Vite (`/ws`), который подставляет `Origin` и сессию.

## Модели (Django)

### Comment

```python
class Comment(models.Model):
    author = FK(User, related_name="comments")
    date = DateTimeField(default=now)
    date_modified = DateTimeField(null=True)          # «Время редактирования»
    site = CharField(choices=[("AL","Альтерлит"),("ALT","AltCG"),("ALL","Оба сайта")], default="AL")
    allow_edit_dt = DateTimeField(null=True)          # «Разрешить редактировать до...»
    status = CharField(choices=draft|published|moderate, default="published")
    content = TextField(null=True)
    on_comment = FK("self", related_name="reply", null=True)   # родитель для ответа
    likes = GenericRelation(Like)
    images = M2M(PostImages, related_name="comment")
    is_banned = BooleanField(default=False)
    content_type = FK(ContentType); object_id = PositiveIntegerField()

    REPLY_COUNT = 3
    COMMENTS_LIMIT = 10
    CONTENT_MAX = SiteParams "comment_content_limit" (по умолчанию 2010)
    CONTENT_SIZE = (1, CONTENT_MAX)   # длина content
```

### PostImages

```python
class PostImages(models.Model):
    image = ImageField(upload_to=path_and_rename)
    user = FK(User, related_name="post_images")
    category = M2M(Category)
    descr = CharField(max_length=2500, null=True)
    date_created = DateTimeField(default=now)
    # производные (imagekit ImageSpecField):
    image_preload        60×40 fill, JPEG q40
    image_preload_min    60×60 fill, JPEG q20   ← это поле preview в ленте
    image_thumbnail      290×210 fit, PNG
    image_thumbnail_vert 290×340 fit, PNG
    image_thumbnail_fill(_vert) 290×210 / 290×340 fill, JPEG
    image_admin(_quad)   125×90 / 110×110
    Meta.ordering = ["-id"]
```

Спеки в том же модуле (пригодятся для превью): `SquareImageWebp` 400×400 WEBP q90,
`FullImageWebp` WEBP q90, `PreloadImg` высота 150 + размытие WEBP q1,
`SquarePostPreload` 40×40 WEBP q20, `DayimageThumbnail` 430×532 JPEG.

### CommentsSessionFetcher (view)

`APIView`, методы GET/POST/DELETE, `JSONParser`, `SessionAuthentication`, `AllowAny`.
GET → `CommentFetcher.from_request(request).fetch(content_type, object_id, SiteByMode(request.mode))`,
ответ `{"success": True, "comments": CommentsToJson(...), "after_exist": ...}`,
любое исключение → 400 `{"success": False, "details": ex.args[0]}`.
POST и DELETE — ещё не разобраны.
