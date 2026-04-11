const addr = '0x52B812Ec8E204541156f1F778B0672bD044a2e79';
const base = `http://localhost:3001/api/public/address/${addr}/slabs`;

let allSlabs = [];
let page = 1;
while (true) {
  const res = await fetch(`${base}?page=${page}&pageSize=50`);
  const body = await res.json();
  allSlabs = allSlabs.concat(body.data);
  if (page >= body.pagination.totalPages) break;
  page++;
}

const priced = allSlabs.filter(s => s.marketPrice != null).sort((a, b) => b.marketPrice - a.marketPrice);

console.log('=== Top 10 highest value cards ===');
for (const s of priced.slice(0, 10)) {
  console.log(`$${s.marketPrice.toFixed(2).padStart(8)}  ${(s.grader || '?').padEnd(4)} ${(s.grade || '?').padEnd(5)}  ${s.cardName} (${s.setName})`);
}

console.log('\nTotal priced:', priced.length, '/', allSlabs.length, '| Total value: $' + priced.reduce((sum, s) => sum + s.marketPrice, 0).toFixed(2));
