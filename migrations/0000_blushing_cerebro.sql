CREATE TABLE "academics" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"class_name" text,
	"teacher_user_id" integer,
	CONSTRAINT "academics_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"teacher_id" integer NOT NULL,
	"date" text NOT NULL,
	"status" text NOT NULL,
	"session" text DEFAULT 'Full Day' NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "class_teachers" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"teacher_id" integer NOT NULL,
	"subjects" text[] NOT NULL,
	"periods_per_week" integer DEFAULT 4 NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"grade" text NOT NULL,
	"section" text NOT NULL,
	"stream" text,
	"academic_year" text NOT NULL,
	"capacity" integer DEFAULT 40 NOT NULL,
	"current_count" integer DEFAULT 0 NOT NULL,
	"homeroom_teacher_id" integer,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_diary" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"date" date NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_teaching_pulse" (
	"id" serial PRIMARY KEY NOT NULL,
	"teacher_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"subject" text NOT NULL,
	"period" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"room" text,
	"date" date NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"marked_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "diary_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"title" text NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fee_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"fee_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"payment_date" text NOT NULL,
	"method" text NOT NULL,
	"receipt_number" text,
	"reference" text,
	"notes" text,
	"created_at" text NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "fees" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"remaining_balance" integer DEFAULT 0 NOT NULL,
	"due_date" text NOT NULL,
	"status" text DEFAULT 'Unpaid' NOT NULL,
	"invoice_number" text,
	"billing_month" text NOT NULL,
	"billing_period" text NOT NULL,
	"description" text NOT NULL,
	"fee_type" text DEFAULT 'Monthly Fee' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"generated_month" text,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_voucher_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"requested_by" integer,
	"status" text DEFAULT 'queued' NOT NULL,
	"billing_months" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"class_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"student_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"force" boolean DEFAULT false NOT NULL,
	"total_invoices" integer DEFAULT 0 NOT NULL,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"archive_size_bytes" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" text,
	"completed_at" text,
	"cancelled_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"fee_id" integer NOT NULL,
	"operation_id" integer,
	"document_number" text NOT NULL,
	"file_name" text NOT NULL,
	"billing_month" text NOT NULL,
	"generation_version" integer DEFAULT 1 NOT NULL,
	"generated_at" text NOT NULL,
	"generated_by" integer
);
--> statement-breakpoint
CREATE TABLE "homework_diary" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"date" date NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "qr_attendance_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"scanned_by" integer NOT NULL,
	"attendance_date" text NOT NULL,
	"scanned_at" text NOT NULL,
	"role_snapshot" text NOT NULL,
	"direction" text NOT NULL,
	"status" text,
	"scan_method" text NOT NULL,
	"terminal_label" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "qr_profiles" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"token_ciphertext" text NOT NULL,
	"token_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"issued_at" text NOT NULL,
	"regenerated_at" text NOT NULL,
	"last_used_at" text,
	"last_used_by" integer,
	"generated_by" integer
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"subject" text NOT NULL,
	"marks" integer NOT NULL,
	"grade" text NOT NULL,
	"total_marks" integer,
	"exam_title" text,
	"exam_type" text,
	"term" text,
	"exam_date" text,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "school_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "school_settings_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"settings_id" integer NOT NULL,
	"action" text NOT NULL,
	"category" text,
	"field_path" text,
	"previous_value" text,
	"next_value" text,
	"change_summary" text,
	"created_at" text NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "school_settings_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"settings_id" integer NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"change_summary" text,
	"created_at" text NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" text PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_billing_profiles" (
	"student_id" integer PRIMARY KEY NOT NULL,
	"monthly_amount" integer NOT NULL,
	"due_day" integer DEFAULT 5 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"class_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"subject" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetable" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_id" integer,
	"class_name" text NOT NULL,
	"day_of_week" text NOT NULL,
	"period_label" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"room" text,
	"class_type" text,
	"teacher_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetable_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" integer DEFAULT 1 NOT NULL,
	"start_time" text DEFAULT '08:00' NOT NULL,
	"end_time" text DEFAULT '15:00' NOT NULL,
	"working_days" integer[] DEFAULT '{1,2,3,4,5,6}' NOT NULL,
	"period_duration" integer DEFAULT 45 NOT NULL,
	"break_after_period" integer[] DEFAULT '{4}' NOT NULL,
	"break_duration" integer DEFAULT 15 NOT NULL,
	"total_periods" integer DEFAULT 8 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "timetable_settings_school_id_unique" UNIQUE("school_id")
);
--> statement-breakpoint
CREATE TABLE "timetable_settings_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"settings_id" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now(),
	"changed_by" integer,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetables" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"fitness_score" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timetables_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"timetable_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"period" integer NOT NULL,
	"subject" text,
	"teacher_id" integer,
	"room" text,
	"is_conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" text NOT NULL,
	"subject" text,
	"designation" text,
	"department" text,
	"employee_id" text,
	"teacher_photo_url" text,
	"class_name" text,
	"father_name" text,
	"student_photo_url" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "academics" ADD CONSTRAINT "academics_teacher_user_id_teachers_user_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."teachers"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_homeroom_teacher_id_users_id_fk" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_diary" ADD CONSTRAINT "daily_diary_template_id_diary_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."diary_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_diary" ADD CONSTRAINT "daily_diary_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_diary" ADD CONSTRAINT "daily_diary_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_teaching_pulse" ADD CONSTRAINT "daily_teaching_pulse_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_teaching_pulse" ADD CONSTRAINT "daily_teaching_pulse_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_templates" ADD CONSTRAINT "diary_templates_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_fee_id_fees_id_fk" FOREIGN KEY ("fee_id") REFERENCES "public"."fees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fees" ADD CONSTRAINT "fees_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_voucher_operations" ADD CONSTRAINT "finance_voucher_operations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_vouchers" ADD CONSTRAINT "finance_vouchers_fee_id_fees_id_fk" FOREIGN KEY ("fee_id") REFERENCES "public"."fees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_vouchers" ADD CONSTRAINT "finance_vouchers_operation_id_finance_voucher_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."finance_voucher_operations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_vouchers" ADD CONSTRAINT "finance_vouchers_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_diary" ADD CONSTRAINT "homework_diary_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_diary" ADD CONSTRAINT "homework_diary_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_attendance_events" ADD CONSTRAINT "qr_attendance_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_attendance_events" ADD CONSTRAINT "qr_attendance_events_scanned_by_users_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_profiles" ADD CONSTRAINT "qr_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_profiles" ADD CONSTRAINT "qr_profiles_last_used_by_users_id_fk" FOREIGN KEY ("last_used_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_profiles" ADD CONSTRAINT "qr_profiles_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_settings_audit_logs" ADD CONSTRAINT "school_settings_audit_logs_settings_id_school_settings_id_fk" FOREIGN KEY ("settings_id") REFERENCES "public"."school_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_settings_audit_logs" ADD CONSTRAINT "school_settings_audit_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_settings_versions" ADD CONSTRAINT "school_settings_versions_settings_id_school_settings_id_fk" FOREIGN KEY ("settings_id") REFERENCES "public"."school_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_settings_versions" ADD CONSTRAINT "school_settings_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_billing_profiles" ADD CONSTRAINT "student_billing_profiles_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_academic_id_academics_id_fk" FOREIGN KEY ("academic_id") REFERENCES "public"."academics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_settings_version" ADD CONSTRAINT "timetable_settings_version_settings_id_timetable_settings_id_fk" FOREIGN KEY ("settings_id") REFERENCES "public"."timetable_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_settings_version" ADD CONSTRAINT "timetable_settings_version_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetables_periods" ADD CONSTRAINT "timetables_periods_timetable_id_timetables_id_fk" FOREIGN KEY ("timetable_id") REFERENCES "public"."timetables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetables_periods" ADD CONSTRAINT "timetables_periods_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_teachers_class_teacher_subjects_idx" ON "class_teachers" USING btree ("class_id","teacher_id","subjects");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_grade_section_stream_year_idx" ON "classes" USING btree ("grade","section","stream","academic_year");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_diary_template_id_date_idx" ON "daily_diary" USING btree ("template_id","date");--> statement-breakpoint
CREATE INDEX "daily_diary_class_id_date_idx" ON "daily_diary" USING btree ("class_id","date");--> statement-breakpoint
CREATE INDEX "idx_pulse_teacher_date" ON "daily_teaching_pulse" USING btree ("teacher_id","date");--> statement-breakpoint
CREATE INDEX "idx_pulse_date" ON "daily_teaching_pulse" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_payments_receipt_number_idx" ON "fee_payments" USING btree ("receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "fees_invoice_number_idx" ON "fees" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "fees_student_generated_month_idx" ON "fees" USING btree ("student_id","generated_month");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_vouchers_fee_idx" ON "finance_vouchers" USING btree ("fee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_vouchers_document_number_idx" ON "finance_vouchers" USING btree ("document_number");--> statement-breakpoint
CREATE UNIQUE INDEX "homework_diary_class_id_date_idx" ON "homework_diary" USING btree ("class_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_attendance_events_user_day_direction_idx" ON "qr_attendance_events" USING btree ("user_id","attendance_date","direction");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_profiles_public_id_idx" ON "qr_profiles" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_profiles_token_hash_idx" ON "qr_profiles" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "timetables_class_id_idx" ON "timetables" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timetables_periods_timetable_day_period_idx" ON "timetables_periods" USING btree ("timetable_id","day_of_week","period");