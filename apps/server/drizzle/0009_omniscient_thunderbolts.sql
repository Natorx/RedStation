CREATE TABLE "project_hostings" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"root_path" varchar(512) DEFAULT '' NOT NULL,
	"last_uploader" varchar(64) DEFAULT '' NOT NULL,
	"first_uploaded_at" timestamp with time zone,
	"last_uploaded_at" timestamp with time zone,
	"file_count" integer DEFAULT 0 NOT NULL,
	"total_bytes" integer DEFAULT 0 NOT NULL,
	"upload_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_hostings" ADD CONSTRAINT "project_hostings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_hostings_project_unique" ON "project_hostings" USING btree ("project_id");