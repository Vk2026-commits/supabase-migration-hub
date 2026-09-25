-- Officers restore the newest master draft by account and application type.
-- The existing indexes cover officer_id and job_application_id, but not this
-- actual restore query, forcing a scan before the page can render.
CREATE INDEX IF NOT EXISTS idx_guard_hiring_applications_user_type_created
ON public.guard_hiring_applications (user_id, application_type, created_at DESC);
