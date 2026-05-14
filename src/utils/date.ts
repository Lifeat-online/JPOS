export const getDate = (ts: any): Date => {
  if (!ts) return new Date(NaN);
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts === 'string' && !ts.includes('T')) return new Date(ts.replace(' ', 'T') + 'Z');
  return new Date(ts);
};