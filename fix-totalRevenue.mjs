import { readFileSync, writeFileSync } from 'fs';

const filePath = 'src/views/DevDashboard.tsx';
const content = readFileSync(filePath, 'utf-8');

const search = `const totalRevenue = useMemo(
    () => sales.filter(s => s.status === 'completed').reduce((acc, s) => acc + s.total, 0),
    [sales],
  );`;

const replace = `const totalRevenue = useMemo(
    () => sales.filter(s => s.status === 'completed').reduce((acc, s) => acc + (Number(s.total) || 0), 0),
    [sales],
  );`;

if (content.includes(search)) {
  const newContent = content.replace(search, replace);
  writeFileSync(filePath, newContent, 'utf-8');
  console.log('Fixed totalRevenue calculation');
} else {
  console.log('Search pattern not found');
  // Try to find what's there
  const idx = content.indexOf('totalRevenue = useMemo');
  if (idx >= 0) {
    console.log('Found near:', content.substring(idx, idx + 200));
  }
}
