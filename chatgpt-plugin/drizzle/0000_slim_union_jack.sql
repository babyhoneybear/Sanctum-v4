CREATE TABLE `bridges` (
	`owner` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`seen` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bridges_id_unique` ON `bridges` (`id`);--> statement-breakpoint
CREATE TABLE `commands` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`bridge` text NOT NULL,
	`method` text NOT NULL,
	`args` text NOT NULL,
	`state` text NOT NULL,
	`result` text,
	`created` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `commands_owner_bridge` ON `commands` (`owner`,`bridge`,`state`);