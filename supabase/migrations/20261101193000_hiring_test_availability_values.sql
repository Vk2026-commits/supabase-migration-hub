-- Match the form's canonical checkbox values; retain all other draft answers.
UPDATE hiring_test_accounts SET application_seed=jsonb_set(jsonb_set(application_seed,'{availability,employmentTypes}','["full_time"]'),'{availability,shiftPreferences}','["first_shift"]') WHERE user_id='c2d2969a-dbb3-45e5-910b-a7c9e4730aa2';
UPDATE guard_hiring_applications a SET application_data=jsonb_set(jsonb_set(a.application_data,'{availability,employmentTypes}','["full_time"]'),'{availability,shiftPreferences}','["first_shift"]')
FROM hiring_test_accounts t WHERE t.user_id='c2d2969a-dbb3-45e5-910b-a7c9e4730aa2' AND a.test_run_id=t.active_run_id AND a.application_type='master' AND a.status='draft';
UPDATE officer_profiles o SET employment_type=ARRAY['full_time'],shift_preference=ARRAY['first_shift'] FROM hiring_test_accounts t WHERE t.user_id='c2d2969a-dbb3-45e5-910b-a7c9e4730aa2' AND o.id=t.officer_id;
