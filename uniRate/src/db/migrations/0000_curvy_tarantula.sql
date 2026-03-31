CREATE TABLE `admission_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `competition_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`department_id` integer NOT NULL,
	`admission_type_id` integer NOT NULL,
	`year` integer NOT NULL,
	`applicants` integer NOT NULL,
	`accepted` integer NOT NULL,
	`rate` real NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`admission_type_id`) REFERENCES `admission_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_competition_rates_year_dept` ON `competition_rates` (`year`,`department_id`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`university_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_departments_university_id` ON `departments` (`university_id`);--> statement-breakpoint
CREATE TABLE `universities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`region` text NOT NULL,
	`type` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_universities_region` ON `universities` (`region`);