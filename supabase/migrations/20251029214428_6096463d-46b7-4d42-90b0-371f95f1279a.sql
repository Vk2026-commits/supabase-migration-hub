-- Create sample security officer accounts for testing
-- Note: These are demo accounts with hashed password 'Demo123!'

-- Insert test users into auth.users
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data,
  aud,
  role
)
VALUES 
  (
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    '00000000-0000-0000-0000-000000000000',
    'sarah.martinez@example.com',
    '$2a$10$abcdefghijklmnopqrstuv',
    NOW(),
    NOW(),
    NOW(),
    '{"full_name": "Sarah Martinez", "username": "smartinez", "role": "officer"}',
    'authenticated',
    'authenticated'
  ),
  (
    'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
    '00000000-0000-0000-0000-000000000000',
    'jennifer.thompson@example.com',
    '$2a$10$abcdefghijklmnopqrstuv',
    NOW(),
    NOW(),
    NOW(),
    '{"full_name": "Jennifer Thompson", "username": "jthompson", "role": "officer"}',
    'authenticated',
    'authenticated'
  ),
  (
    'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
    '00000000-0000-0000-0000-000000000000',
    'michael.johnson@example.com',
    '$2a$10$abcdefghijklmnopqrstuv',
    NOW(),
    NOW(),
    NOW(),
    '{"full_name": "Michael Johnson", "username": "mjohnson", "role": "officer"}',
    'authenticated',
    'authenticated'
  ),
  (
    'd4e5f6a7-b8c9-4d5e-8f9a-0b1c2d3e4f5a',
    '00000000-0000-0000-0000-000000000000',
    'david.williams@example.com',
    '$2a$10$abcdefghijklmnopqrstuv',
    NOW(),
    NOW(),
    NOW(),
    '{"full_name": "David Williams", "username": "dwilliams", "role": "officer"}',
    'authenticated',
    'authenticated'
  )
ON CONFLICT (id) DO NOTHING;

-- The handle_new_user trigger will create profiles automatically
-- Wait a moment for trigger to complete
SELECT pg_sleep(0.1);

-- Now insert officer profiles
INSERT INTO public.officer_profiles (
  user_id, 
  title, 
  bio, 
  phone, 
  location,
  address_street,
  address_city,
  address_state,
  address_zip,
  address_country,
  years_experience,
  hourly_rate,
  availability_status,
  shift_preference,
  employment_type,
  main_region
)
VALUES 
  (
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    'Licensed Security Officer',
    'Experienced security professional with 6 years in corporate and retail security. Trained in conflict resolution, emergency response, and access control systems. Hold valid Texas security license and CPR certification.',
    '(713) 555-0142',
    'Houston, TX',
    '1234 Main Street',
    'Houston',
    'Texas',
    '77002',
    'United States of America',
    6,
    28.50,
    'available',
    ARRAY['first_shift', 'second_shift'],
    ARRAY['full_time', 'part_time'],
    'Houston'
  ),
  (
    'b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e',
    'Senior Security Specialist',
    'Dedicated security professional with 8 years of experience in healthcare and educational facilities. Expertise in surveillance systems, patrol operations, and incident reporting. Certified in first aid and defensive tactics.',
    '(919) 555-0198',
    'Raleigh, NC',
    '456 Oak Avenue',
    'Raleigh',
    'North Carolina',
    '27601',
    'United States of America',
    8,
    32.00,
    'available',
    ARRAY['first_shift', 'second_shift', 'third_shift'],
    ARRAY['full_time'],
    'Raleigh'
  ),
  (
    'c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f',
    'Armed Security Officer',
    'Professional security officer with 10 years of experience in high-security environments. Licensed to carry firearms in Texas. Specialized in executive protection, event security, and loss prevention. Former military police with extensive training.',
    '(214) 555-0276',
    'Dallas, TX',
    '789 Commerce Street',
    'Dallas',
    'Texas',
    '75201',
    'United States of America',
    10,
    38.00,
    'available',
    ARRAY['first_shift', 'second_shift', 'weekend'],
    ARRAY['full_time', 'seasonal'],
    'Dallas'
  ),
  (
    'd4e5f6a7-b8c9-4d5e-8f9a-0b1c2d3e4f5a',
    'Security Supervisor',
    'Experienced security supervisor with 12 years in the industry. Background in hospitality and entertainment venue security. Skilled in team leadership, training, and security operations management. Certified in crowd control and emergency management.',
    '(901) 555-0334',
    'Memphis, TN',
    '321 Beale Street',
    'Memphis',
    'Tennessee',
    '38103',
    'United States of America',
    12,
    35.00,
    'available',
    ARRAY['second_shift', 'third_shift', 'weekend'],
    ARRAY['full_time'],
    'Memphis'
  )
ON CONFLICT (user_id) DO NOTHING;