CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" varchar(500) NOT NULL,
	"type" varchar(16) DEFAULT 'report' NOT NULL,
	"visibility" varchar(16) DEFAULT 'team' NOT NULL,
	"project_id" integer,
	"author_id" integer,
	"author_name" varchar(64) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_mentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"author_id" integer,
	"author_name" varchar(64) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar(96) NOT NULL,
	"tag" varchar(32) DEFAULT '未分类' NOT NULL,
	"color" varchar(16) DEFAULT 'red' NOT NULL,
	"unread" boolean DEFAULT false NOT NULL,
	"ui" varchar(8) DEFAULT 'GUI' NOT NULL,
	"purpose" varchar(255) DEFAULT '' NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"stack" varchar(255) DEFAULT '' NOT NULL,
	"frameworks" varchar(255) DEFAULT '' NOT NULL,
	"deployed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" varchar(255) NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"type" varchar(16) DEFAULT '开发' NOT NULL,
	"priority" varchar(8) DEFAULT 'medium' NOT NULL,
	"due_at" timestamp with time zone,
	"author_id" integer,
	"author_name" varchar(64) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_mentions" ADD CONSTRAINT "activity_mentions_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_mentions" ADD CONSTRAINT "activity_mentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_created_idx" ON "activities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activities_author_idx" ON "activities" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "activities_project_idx" ON "activities" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_mentions_unique" ON "activity_mentions" USING btree ("activity_id","user_id");--> statement-breakpoint
CREATE INDEX "activity_mentions_user_idx" ON "activity_mentions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_tasks_project_idx" ON "project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_tasks_done_idx" ON "project_tasks" USING btree ("done");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_label_unique" ON "projects" USING btree ("label");--> statement-breakpoint
CREATE INDEX "projects_tag_idx" ON "projects" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "todos_done_idx" ON "todos" USING btree ("done");--> statement-breakpoint
CREATE INDEX "todos_type_idx" ON "todos" USING btree ("type");--> statement-breakpoint
CREATE INDEX "todos_priority_idx" ON "todos" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "todos_created_idx" ON "todos" USING btree ("created_at");