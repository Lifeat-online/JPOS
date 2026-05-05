const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/views/DevDashboard.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Fix the totalRevenue calculation to handle null/undefined values
const oldCode = `const totalRevenue = useMemo(
    () => sales.filter(s => s.status === 'completed').reduce((acc, s) => acc + s.total, 0),
    [sales],
  );`;

const newCode = `const totalRevenue = useMemo(
    () => sales.filter(s => s.status === 'completed').reduce((acc, s) => acc + (Number(s.total) || 0), 0),
    [sales],
  );`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully fixed totalRevenue calculation');
} else {
  console.log('Could not find the exact code pattern');
  // Let's find what's there
  const idx = content.indexOf('totalRevenue = useMemo');
  if (idx !== -1) {
    console.log('Found at position', idx);
    console.log('Context:', JSON.stringify(content.substring(idx, idx + 200)));
  }
}
