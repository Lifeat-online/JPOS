import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'jimmy_pos',
  waitForConnections: true,
  connectionLimit: 1,
});

const FIREBASE_UID = 'Rkfh8ZhwKMXQJurorDSeqf86qOS2';
const EMAIL = 'jameskoen78@gmail.com';
const NAME = 'James Koen';
const TENANT_ID = 'dev-tenant-001';
const TENANT_NAME = 'Jimmy\'s POS Dev';

async function setup() {
  try {
    const conn = await pool.getConnection();
    
    console.log('Checking for existing tenant...');
    const [tenants] = await conn.execute('SELECT id FROM tenants WHERE id = ?', [TENANT_ID]);
    
    if (tenants.length === 0) {
      console.log('Creating tenant...');
      await conn.execute(
        'INSERT INTO tenants (id, name) VALUES (?, ?)',
        [TENANT_ID, TENANT_NAME]
      );
      console.log('Tenant created:', TENANT_ID);
    } else {
      console.log('Tenant already exists:', TENANT_ID);
    }
    
    console.log('Checking for existing user...');
    const [users] = await conn.execute('SELECT uid FROM users WHERE uid = ?', [FIREBASE_UID]);
    
    if (users.length === 0) {
      console.log('Creating user record...');
      await conn.execute(
        'INSERT INTO users (uid, tenant_id, email, name) VALUES (?, ?, ?, ?)',
        [FIREBASE_UID, TENANT_ID, EMAIL, NAME]
      );
      console.log('User record created for UID:', FIREBASE_UID);
    } else {
      console.log('User record already exists for UID:', FIREBASE_UID);
    }
    
    console.log('Checking for existing staff record...');
    const [staff] = await conn.execute('SELECT id FROM staff WHERE email = ?', [EMAIL]);
    
    if (staff.length === 0) {
      console.log('Creating staff record with dev role...');
      const staffId = 'dev-staff-' + Date.now();
      await conn.execute(
        `INSERT INTO staff (id, tenant_id, name, role, email, status) 
         VALUES (?, ?, ?, 'dev', ?, 'active')`,
        [staffId, TENANT_ID, NAME, EMAIL]
      );
      console.log('Staff record created with ID:', staffId);
    } else {
      console.log('Staff record already exists, updating role to dev...');
      await conn.execute(
        'UPDATE staff SET role = "dev", tenant_id = ? WHERE email = ?',
        [TENANT_ID, EMAIL]
      );
      console.log('Staff role updated to dev');
    }
    
    console.log('Checking for app_settings...');
    const [settings] = await conn.execute('SELECT tenant_id FROM app_settings WHERE tenant_id = ?', [TENANT_ID]);
    
    if (settings.length === 0) {
      console.log('Creating app_settings...');
      await conn.execute(
        `INSERT INTO app_settings (tenant_id, setup_completed) VALUES (?, TRUE)`,
        [TENANT_ID]
      );
      console.log('App settings created');
    }
    
    await conn.release();
    await pool.end();
    
    console.log('\nSetup complete! Your account should now work.');
    console.log('Tenant ID:', TENANT_ID);
    console.log('Email:', EMAIL);
    console.log('Role: dev');
    
  } catch (err) {
    console.error('Setup failed:', err);
    process.exit(1);
  }
}

setup();
