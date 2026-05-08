-- Setup dev user for jameskoen78@gmail.com

-- Create tenant if not exists
INSERT INTO tenants (id, name) 
SELECT 'dev-tenant-001', 'Jimmy\'s POS Dev' 
FROM DUAL 
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = 'dev-tenant-001');

-- Create user record if not exists  
INSERT INTO users (uid, tenant_id, email, name)
SELECT 'Rkfh8ZhwKMXQJurorDSeqf86qOS2', 'dev-tenant-001', 'jameskoen78@gmail.com', 'James Koen'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users WHERE uid = 'Rkfh8ZhwKMXQJurorDSeqf86qOS2');

-- Create or update staff record with dev role
INSERT INTO staff (id, tenant_id, name, role, email, status)
SELECT 'dev-staff-001', 'dev-tenant-001', 'James Koen', 'dev', 'jameskoen78@gmail.com', 'active'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM staff WHERE email = 'jameskoen78@gmail.com');

-- If staff exists, update to dev role
UPDATE staff SET role = 'dev', tenant_id = 'dev-tenant-001' WHERE email = 'jameskoen78@gmail.com';

-- Create app_settings if not exists
INSERT INTO app_settings (tenant_id, setup_completed)
SELECT 'dev-tenant-001', TRUE
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE tenant_id = 'dev-tenant-001');

-- Verify
SELECT 'Tenants:' AS '';
SELECT id, name FROM tenants WHERE id = 'dev-tenant-001';
SELECT 'Users:' AS '';
SELECT uid, email, tenant_id FROM users WHERE uid = 'Rkfh8ZhwKMXQJurorDSeqf86qOS2';
SELECT 'Staff:' AS '';
SELECT id, email, role, tenant_id FROM staff WHERE email = 'jameskoen78@gmail.com';
