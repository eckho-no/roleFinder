CREATE TABLE `agent_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer,
	`listing_id` integer,
	`agent_name` text NOT NULL,
	`agent_version` text,
	`prompt_version` text,
	`parent_agent_run_id` integer,
	`model` text NOT NULL,
	`input` text,
	`output` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`cost_estimate_usd` real,
	`latency_ms` integer,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_runs_run_id_idx` ON `agent_runs` (`run_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_listing_id_idx` ON `agent_runs` (`listing_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_parent_agent_run_id_idx` ON `agent_runs` (`parent_agent_run_id`);--> statement-breakpoint
CREATE TABLE `duplicates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`duplicate_of_listing_id` integer NOT NULL,
	`method` text NOT NULL,
	`similarity` real,
	`status` text NOT NULL,
	`agent_run_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`duplicate_of_listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `duplicates_listing_id_idx` ON `duplicates` (`listing_id`);--> statement-breakpoint
CREATE INDEX `duplicates_duplicate_of_listing_id_idx` ON `duplicates` (`duplicate_of_listing_id`);--> statement-breakpoint
CREATE TABLE `reflections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question` text NOT NULL,
	`context` text,
	`status` text DEFAULT 'open' NOT NULL,
	`answer` text,
	`proposed_config_diff` text,
	`sample_size` integer NOT NULL,
	`created_at` integer NOT NULL,
	`answered_at` integer,
	`agent_run_id` integer,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`domain_flag` integer DEFAULT false NOT NULL,
	`domain_note` text,
	`careers_url` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_slug_unique` ON `companies` (`slug`);--> statement-breakpoint
CREATE TABLE `listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`link_type` text NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`location` text,
	`remote_type` text NOT NULL,
	`salary_min` integer,
	`salary_max` integer,
	`salary_currency` text,
	`salary_period` text,
	`salary_stated` integer DEFAULT false NOT NULL,
	`posted_date` integer,
	`expires_at` integer,
	`deadline_source` text NOT NULL,
	`status` text NOT NULL,
	`triage` text NOT NULL,
	`status_confirmed_at` integer,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`sighting_count` integer DEFAULT 0 NOT NULL,
	`outcome` text DEFAULT 'none' NOT NULL,
	`outcome_at` integer,
	`raw_text` text,
	`embedding_status` text DEFAULT 'pending' NOT NULL,
	`embedded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `listings_company_id_idx` ON `listings` (`company_id`);--> statement-breakpoint
CREATE INDEX `listings_status_idx` ON `listings` (`status`);--> statement-breakpoint
CREATE INDEX `listings_triage_idx` ON `listings` (`triage`);--> statement-breakpoint
CREATE INDEX `listings_expires_at_idx` ON `listings` (`expires_at`);--> statement-breakpoint
CREATE TABLE `queries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`added_in_run_id` integer,
	`retired_in_run_id` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`added_in_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`retired_in_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `queries_added_in_run_id_idx` ON `queries` (`added_in_run_id`);--> statement-breakpoint
CREATE INDEX `queries_retired_in_run_id_idx` ON `queries` (`retired_in_run_id`);--> statement-breakpoint
CREATE TABLE `sightings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`run_id` integer NOT NULL,
	`query_id` integer,
	`source` text NOT NULL,
	`seen_at` integer NOT NULL,
	`raw_snippet` text,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`query_id`) REFERENCES `queries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sightings_listing_id_idx` ON `sightings` (`listing_id`);--> statement-breakpoint
CREATE INDEX `sightings_run_id_idx` ON `sightings` (`run_id`);--> statement-breakpoint
CREATE INDEX `sightings_query_id_idx` ON `sightings` (`query_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer,
	`company_id` integer,
	`type` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text NOT NULL,
	`agent_run_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notes_listing_id_idx` ON `notes` (`listing_id`);--> statement-breakpoint
CREATE INDEX `notes_company_id_idx` ON `notes` (`company_id`);--> statement-breakpoint
CREATE TABLE `profile_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` integer NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`titles` text NOT NULL,
	`location_rules` text NOT NULL,
	`salary_floor` integer NOT NULL,
	`salary_hard_floor` integer NOT NULL,
	`positioning` text NOT NULL,
	`axes` text NOT NULL,
	`tier_thresholds` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	`note` text
);
--> statement-breakpoint
CREATE INDEX `profile_config_is_current_idx` ON `profile_config` (`is_current`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_number` integer NOT NULL,
	`label` text,
	`kind` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`summary` text,
	`source` text,
	`stats` text
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`profile_config_id` integer NOT NULL,
	`axes` text NOT NULL,
	`total` integer NOT NULL,
	`tier` text NOT NULL,
	`scored_by` text NOT NULL,
	`rationale` text,
	`confidence` real,
	`agent_run_id` integer,
	`superseded_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_config_id`) REFERENCES `profile_config`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`superseded_by`) REFERENCES `scores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scores_listing_id_idx` ON `scores` (`listing_id`);--> statement-breakpoint
CREATE INDEX `scores_profile_config_id_idx` ON `scores` (`profile_config_id`);--> statement-breakpoint
CREATE INDEX `scores_agent_run_id_idx` ON `scores` (`agent_run_id`);