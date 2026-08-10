-- Update app_role enum to include new permission levels
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'view_only';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'full_access';

-- Create edge function to invite users with roles
-- (Users will need to be invited via email)