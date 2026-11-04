-- Require the full paper-application question set on new submissions only.
CREATE OR REPLACE FUNCTION public.hiring_declarations_complete(data jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE levels jsonb := data->'licenseLevels'; pair text[]; school jsonb; item jsonb; found_item boolean;
BEGIN
  IF data IS NULL OR jsonb_typeof(levels) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(levels)=0 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(levels) x(value)
     WHERE value IS NULL OR value NOT IN ('Level II','Level III','Level IV','No license')) THEN RETURN false; END IF;
  IF levels ? 'No license' AND jsonb_array_length(levels) <> 1 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['isAdult','eligibleToWork','driversLicense','hasWorkHistory','hasReferences']) f
    WHERE coalesce(data->>f,'') NOT IN ('Yes','No')) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['firstName','lastName','startDate','professionalActivities','machinesEquipment','skills']) f
    WHERE coalesce(btrim(data->>f),'')='') THEN RETURN false; END IF;
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['appliedBefore','appliedBeforeWhen'],['employedHereBefore','employedHereWhen'],
    ['convicted','convictionDetails'],['outsideEmployment','outsideEmploymentDetails'],
    ['licenseSuspended','licenseSuspendedDetails'],['otherNamesUsed','otherNames'],
    ['presentlyEmployed','contactSuggestion'],['everFired','firedDetails']
  ] LOOP
    IF coalesce(data->>pair[1],'') NOT IN ('Yes','No') THEN RETURN false; END IF;
    IF data->>pair[1]='Yes' AND coalesce(btrim(data->>pair[2]),'')='' THEN RETURN false; END IF;
  END LOOP;
  IF data->>'driversLicense'='Yes' AND EXISTS (SELECT 1 FROM unnest(ARRAY['driversLicenseNumber','licenseClass','driverLicenseState']) f WHERE coalesce(btrim(data->>f),'')='') THEN RETURN false; END IF;
  IF jsonb_typeof(data->'schoolHistory') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(data->'schoolHistory') <> 3 THEN RETURN false; END IF;
  FOR school IN SELECT value FROM jsonb_array_elements(data->'schoolHistory') LOOP
    IF coalesce(school->>'attended','') NOT IN ('Yes','No') THEN RETURN false; END IF;
    IF school->>'attended'='Yes' AND EXISTS (SELECT 1 FROM unnest(ARRAY['name','years','degree','subjects']) f WHERE coalesce(btrim(school->>f),'')='') THEN RETURN false; END IF;
  END LOOP;
  IF data->>'hasWorkHistory'='Yes' THEN
    IF jsonb_typeof(data->'workHistory') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    found_item := false;
    FOR item IN SELECT value FROM jsonb_array_elements(data->'workHistory') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_each_text(item) e WHERE e.key <> 'id' AND coalesce(btrim(e.value),'') <> '') THEN
        found_item := true;
        IF EXISTS (SELECT 1 FROM unnest(ARRAY['employer','title','startDate','supervisor','phone','address','cityStateZip','payStart','payFinal','reason']) f WHERE coalesce(btrim(item->>f),'')='') THEN RETURN false; END IF;
      END IF;
    END LOOP;
    IF NOT found_item THEN RETURN false; END IF;
  END IF;
  IF data->>'hasReferences'='Yes' THEN
    IF jsonb_typeof(data->'references') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    found_item := false;
    FOR item IN SELECT value FROM jsonb_array_elements(data->'references') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_each_text(item) e WHERE coalesce(btrim(e.value),'') <> '') THEN
        found_item := true;
        IF EXISTS (SELECT 1 FROM unnest(ARRAY['name','address','phone']) f WHERE coalesce(btrim(item->>f),'')='') THEN RETURN false; END IF;
      END IF;
    END LOOP;
    IF NOT found_item THEN RETURN false; END IF;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.hiring_declarations_complete(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hiring_declarations_complete(jsonb) TO authenticated;
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.submit_my_hiring_application(uuid,uuid,uuid,text,text,text,text,date,jsonb)'::regprocedure) INTO definition;
  definition := replace(definition,
    'Answer each Yes/No eligibility question and select Level 2, Level 3, Level 4, or No license before submitting',
    'Complete all required application questions and applicable follow-up details before submitting');
  EXECUTE definition;
END $$;
