-- Enable realtime for admin dashboard tables
ALTER TABLE company_profiles REPLICA IDENTITY FULL;
ALTER TABLE officer_profiles REPLICA IDENTITY FULL;
ALTER TABLE hires REPLICA IDENTITY FULL;
ALTER TABLE profile_views REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE company_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE officer_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE hires;
ALTER PUBLICATION supabase_realtime ADD TABLE profile_views;