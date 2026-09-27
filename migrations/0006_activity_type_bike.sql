-- Rename stored cycling activity_type from ride → bike (canonical app id).

UPDATE runs
SET activity_type = 'bike'
WHERE lower(trim(activity_type)) = 'ride';

UPDATE planned_route_links
SET plan_activity_type = 'bike'
WHERE lower(trim(plan_activity_type)) = 'ride';

-- Context JSON blobs (settings, habits, goals, plan, …): keys and string values named "ride".
UPDATE context
SET content = replace(content, '"ride"', '"bike"')
WHERE instr(content, '"ride"') > 0;
