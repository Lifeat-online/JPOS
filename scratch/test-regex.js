const regex = /\b[aA][sS]\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g;

const queries = [
  "SELECT id, tenant_id AS tenantId FROM sales",
  "select name, price as productPrice from products",
  "SELECT * FROM users AS u",
  "INSERT INTO table (col) VALUES (?)",
  "SELECT count(*) as total_count FROM staff"
];

queries.forEach(q => {
  const quoted = q.replace(regex, 'AS "$1"');
  console.log(`Original: ${q}`);
  console.log(`Quoted:   ${quoted}`);
  console.log('---');
});
