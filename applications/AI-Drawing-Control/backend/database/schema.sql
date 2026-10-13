-- Drawing Control - database nibl_drawing, schema drawing.
-- The backend creates all of this automatically on start (database/connection.py).
-- Plain-SQL copy for reference / manual setup.

create schema if not exists drawing;
create extension if not exists pg_trgm;

CREATE TABLE drawing.audit_logs (
	action TEXT NOT NULL, 
	actor_id TEXT NOT NULL, 
	actor_name TEXT NOT NULL, 
	target_type TEXT, 
	target_id TEXT, 
	target_label TEXT, 
	before JSONB, 
	after JSONB, 
	note TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id UUID NOT NULL, 
	CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
CREATE INDEX audit_logs_created_idx ON drawing.audit_logs (created_at DESC);
CREATE INDEX audit_logs_target_idx ON drawing.audit_logs (target_type, target_id);

CREATE TABLE drawing.dc_access_log (
	drawing_id UUID NOT NULL, 
	revision_id UUID NOT NULL, 
	drawing_no TEXT NOT NULL, 
	rev_label TEXT NOT NULL, 
	user_id TEXT NOT NULL, 
	user_name TEXT NOT NULL, 
	action TEXT NOT NULL, 
	ip TEXT, 
	at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id UUID NOT NULL, 
	CONSTRAINT dc_access_log_pkey PRIMARY KEY (id)
);
CREATE INDEX dc_access_log_at_idx ON drawing.dc_access_log (at DESC);
CREATE INDEX dc_access_log_drawing_idx ON drawing.dc_access_log (drawing_id, at DESC);
CREATE INDEX dc_access_log_user_idx ON drawing.dc_access_log (user_id, at DESC);

CREATE TABLE drawing.dc_folders (
	parent_id UUID, 
	name TEXT NOT NULL, 
	created_by TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	id UUID NOT NULL, 
	CONSTRAINT dc_folders_pkey PRIMARY KEY (id), 
	CONSTRAINT dc_folders_parent_id_fkey FOREIGN KEY(parent_id) REFERENCES drawing.dc_folders (id) ON DELETE RESTRICT
);
CREATE INDEX dc_folders_parent_idx ON drawing.dc_folders (parent_id);
CREATE UNIQUE INDEX dc_folders_sibling_name_key ON drawing.dc_folders (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE TABLE drawing.dc_reviewer_list (
	user_id UUID NOT NULL, 
	added_by TEXT NOT NULL, 
	added_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	CONSTRAINT dc_reviewer_list_pkey PRIMARY KEY (user_id)
);

CREATE TABLE drawing.email_logs (
	email_type TEXT NOT NULL, 
	to_emails JSONB DEFAULT '[]' NOT NULL, 
	cc_emails JSONB DEFAULT '[]' NOT NULL, 
	subject TEXT NOT NULL, 
	order_no TEXT, 
	stage_code TEXT, 
	dedupe_key TEXT, 
	status TEXT DEFAULT 'sent' NOT NULL, 
	error TEXT, 
	sent_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id UUID NOT NULL, 
	CONSTRAINT email_logs_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX email_logs_dedupe_key ON drawing.email_logs (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX email_logs_sent_at_idx ON drawing.email_logs (sent_at DESC);

CREATE TABLE drawing.users (
	id UUID NOT NULL, 
	name TEXT NOT NULL, 
	email TEXT NOT NULL, 
	employee_code TEXT, 
	department TEXT, 
	role TEXT DEFAULT 'user' NOT NULL, 
	status TEXT DEFAULT 'pending' NOT NULL, 
	is_active BOOLEAN DEFAULT 'true' NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	decided_by TEXT, 
	decided_at TIMESTAMP WITH TIME ZONE, 
	CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE INDEX users_status_idx ON drawing.users (status);
CREATE UNIQUE INDEX users_email_key ON drawing.users (lower(email));

CREATE TABLE drawing.dc_drawings (
	folder_id UUID NOT NULL, 
	drawing_no TEXT NOT NULL, 
	item_code TEXT DEFAULT '' NOT NULL, 
	description TEXT DEFAULT '' NOT NULL, 
	current_revision_id UUID, 
	current_rev_label TEXT DEFAULT '' NOT NULL, 
	revision_count INTEGER DEFAULT '0' NOT NULL, 
	status TEXT DEFAULT 'under_review' NOT NULL, 
	created_by TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	id UUID NOT NULL, 
	CONSTRAINT dc_drawings_pkey PRIMARY KEY (id), 
	CONSTRAINT dc_drawings_folder_id_fkey FOREIGN KEY(folder_id) REFERENCES drawing.dc_folders (id) ON DELETE RESTRICT
);
CREATE INDEX dc_drawings_item_code_idx ON drawing.dc_drawings (lower(item_code));
CREATE INDEX dc_drawings_updated_idx ON drawing.dc_drawings (updated_at DESC);
CREATE INDEX dc_drawings_folder_idx ON drawing.dc_drawings (folder_id);
CREATE INDEX dc_drawings_status_idx ON drawing.dc_drawings (status);
CREATE UNIQUE INDEX dc_drawings_drawing_no_key ON drawing.dc_drawings (lower(drawing_no));

CREATE TABLE drawing.dc_revisions (
	drawing_id UUID NOT NULL, 
	seq INTEGER NOT NULL, 
	rev_label TEXT NOT NULL, 
	change_note TEXT DEFAULT '' NOT NULL, 
	original_filename TEXT NOT NULL, 
	storage_path TEXT NOT NULL, 
	size_bytes BIGINT NOT NULL, 
	sha256 TEXT NOT NULL, 
	status TEXT DEFAULT 'under_review' NOT NULL, 
	locked BOOLEAN DEFAULT 'false' NOT NULL, 
	uploaded_by TEXT NOT NULL, 
	uploaded_by_name TEXT NOT NULL, 
	uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	decided_at TIMESTAMP WITH TIME ZONE, 
	locked_at TIMESTAMP WITH TIME ZONE, 
	locked_by_name TEXT, 
	id UUID NOT NULL, 
	CONSTRAINT dc_revisions_pkey PRIMARY KEY (id), 
	CONSTRAINT dc_revisions_drawing_id_fkey FOREIGN KEY(drawing_id) REFERENCES drawing.dc_drawings (id) ON DELETE CASCADE, 
	CONSTRAINT dc_revisions_storage_path_key UNIQUE (storage_path)
);
CREATE UNIQUE INDEX dc_revisions_drawing_seq_key ON drawing.dc_revisions (drawing_id, seq);
CREATE INDEX dc_revisions_locked_idx ON drawing.dc_revisions (locked, locked_at DESC);

CREATE TABLE drawing.dc_reviews (
	revision_id UUID NOT NULL, 
	drawing_id UUID NOT NULL, 
	user_id UUID NOT NULL, 
	user_name TEXT NOT NULL, 
	user_email TEXT NOT NULL, 
	decision TEXT DEFAULT 'pending' NOT NULL, 
	reason TEXT, 
	decided_at TIMESTAMP WITH TIME ZONE, 
	notified_at TIMESTAMP WITH TIME ZONE, 
	reminders_sent INTEGER DEFAULT '0' NOT NULL, 
	last_reminded_at TIMESTAMP WITH TIME ZONE, 
	id UUID NOT NULL, 
	CONSTRAINT dc_reviews_pkey PRIMARY KEY (id), 
	CONSTRAINT dc_reviews_revision_id_fkey FOREIGN KEY(revision_id) REFERENCES drawing.dc_revisions (id) ON DELETE CASCADE
);
CREATE INDEX dc_reviews_pending_idx ON drawing.dc_reviews (decision, last_reminded_at);
CREATE UNIQUE INDEX dc_reviews_revision_user_key ON drawing.dc_reviews (revision_id, user_id);
CREATE INDEX dc_reviews_user_pending_idx ON drawing.dc_reviews (user_id, decision);

create index if not exists dc_drawings_search_trgm on drawing.dc_drawings
    using gin ((lower(drawing_no || ' ' || item_code || ' ' || description)) gin_trgm_ops);
