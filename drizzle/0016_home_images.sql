CREATE TABLE `home_images` (
	`id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`data` blob NOT NULL,
	`byte_size` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "home_images_type_check" CHECK("home_images"."content_type" IN ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "home_images_size_check" CHECK(typeof("home_images"."data") = 'blob' AND "home_images"."byte_size" BETWEEN 1 AND 786432 AND length("home_images"."data") = "home_images"."byte_size")
);
