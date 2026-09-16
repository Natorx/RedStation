ALTER TABLE "projects" ADD COLUMN "project_url" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "repo_url" varchar(255) DEFAULT '' NOT NULL;