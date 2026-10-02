CREATE TABLE `home_notices` (
  `id` text PRIMARY KEY NOT NULL,
  `text` text NOT NULL,
  `published` integer DEFAULT 0 NOT NULL,
  `sort_order` integer NOT NULL,
  CONSTRAINT `home_notices_text_check` CHECK(length(trim(`text`)) BETWEEN 1 AND 180),
  CONSTRAINT `home_notices_published_check` CHECK(`published` IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `home_columns` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `image_url` text DEFAULT '' NOT NULL,
  `image_alt` text DEFAULT '' NOT NULL,
  `link_url` text DEFAULT '' NOT NULL,
  `link_label` text DEFAULT '' NOT NULL,
  `published` integer DEFAULT 0 NOT NULL,
  `sort_order` integer NOT NULL,
  CONSTRAINT `home_columns_title_check` CHECK(length(trim(`title`)) BETWEEN 1 AND 100),
  CONSTRAINT `home_columns_body_check` CHECK(length(trim(`body`)) BETWEEN 1 AND 4000),
  CONSTRAINT `home_columns_published_check` CHECK(`published` IN (0, 1))
);
--> statement-breakpoint
INSERT INTO app_revisions(scope, revision, write_token) VALUES('home_content', 0, '');
--> statement-breakpoint
INSERT INTO home_notices(id, text, published, sort_order) VALUES
  ('notice-1', '川鍋：台湾へ出張🇹🇼', 1, 0),
  ('notice-2', '芝田：深谷に移住 筋トレにハマる', 1, 1),
  ('notice-3', '川高：直近5試合 脅威の打率.800', 1, 2);
--> statement-breakpoint
INSERT INTO home_columns(id, title, body, image_url, image_alt, link_url, link_label, published, sort_order) VALUES
  ('column-recruitment', '選手募集', 'YG FIRESでは、楽しみながら本気でプロスタを目指しているチームです。
興味のある方はぜひInstagramのDMにてご連絡ください。', '/homepage/bosyu.JPG', 'YG FIRES 選手募集', 'https://www.instagram.com/yg_fires?stkn=bWo3MHYzcm01MzZ3', 'Instagramでチームを見る', 1, 0);
