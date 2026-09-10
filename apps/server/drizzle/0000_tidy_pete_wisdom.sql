CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" varchar(16) NOT NULL,
	"name" varchar(64) NOT NULL,
	"initials" varchar(8),
	"email" varchar(160) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(32) DEFAULT '成员' NOT NULL,
	"title" varchar(64),
	"color" varchar(16) DEFAULT '#dc2626' NOT NULL,
	"teams" varchar(255) DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"perm_project" boolean DEFAULT true NOT NULL,
	"perm_task_assign" boolean DEFAULT true NOT NULL,
	"perm_post" boolean DEFAULT true NOT NULL,
	"perm_team_manage" boolean DEFAULT false NOT NULL,
	"perm_report_export" boolean DEFAULT false NOT NULL,
	"perm_system_setting" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_uid_unique" ON "users" USING btree ("uid");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_name_idx" ON "users" USING btree ("name");