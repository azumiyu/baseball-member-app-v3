CREATE TABLE `accounting_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`category` text NOT NULL,
	`income` integer NOT NULL,
	`expense` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "accounting_entries_category_check" CHECK(length(trim("accounting_entries"."category")) BETWEEN 1 AND 100),
	CONSTRAINT "accounting_entries_income_check" CHECK(typeof("accounting_entries"."income") = 'integer' AND "accounting_entries"."income" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "accounting_entries_expense_check" CHECK(typeof("accounting_entries"."expense") = 'integer' AND "accounting_entries"."expense" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "accounting_entries_amount_check" CHECK("accounting_entries"."income" > 0 OR "accounting_entries"."expense" > 0)
);

--> statement-breakpoint
CREATE INDEX `accounting_entries_date_idx` ON `accounting_entries` (`date` DESC,`created_at` DESC,`id`);
--> statement-breakpoint
CREATE TABLE `membership_payments` (
	`year` integer NOT NULL,
	`player_id` text NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`paid_at` integer,
	PRIMARY KEY(`year`, `player_id`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "membership_payments_year_check" CHECK("membership_payments"."year" BETWEEN 1900 AND 9999),
	CONSTRAINT "membership_payments_paid_check" CHECK("membership_payments"."paid" IN (0, 1)),
	CONSTRAINT "membership_payments_paid_at_check" CHECK(("membership_payments"."paid" = 0 AND "membership_payments"."paid_at" IS NULL) OR ("membership_payments"."paid" = 1 AND "membership_payments"."paid_at" IS NOT NULL))
);

--> statement-breakpoint
INSERT INTO app_revisions(scope, revision, write_token) VALUES('accounting', 0, '');
