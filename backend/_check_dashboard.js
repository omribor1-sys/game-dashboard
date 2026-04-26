const db = require('./database');

// What's in games table
const gamesTable = db.prepare('SELECT name, date, completed FROM games ORDER BY date DESC').all();
console.log('=== games table ===');
gamesTable.forEach(g => console.log(`  [${g.completed ? 'CLOSED' : 'OPEN'}] "${g.name}" | ${g.date}`));

// What's in inventory table (distinct game_names NOT in games table)
const gamesTableNames = new Set(gamesTable.map(g => g.name));
const invGames = db.prepare('SELECT DISTINCT game_name, game_date FROM inventory ORDER BY game_date DESC').all();
console.log('\n=== inventory-only games (not in games table) ===');
invGames.filter(g => !gamesTableNames.has(g.game_name)).forEach(g => console.log(`  "${g.game_name}" | ${g.game_date}`));

// What's in orders table (distinct game_names NOT in games table and NOT in inventory)
const invNames = new Set(invGames.map(g => g.game_name));
const ordGames = db.prepare(`
  SELECT game_name, MAX(game_datetime) as gdt, COUNT(*) as cnt, SUM(total_amount) as rev
  FROM orders WHERE deleted_at IS NULL AND (status IS NULL OR status != 'Cancelled') AND game_name IS NOT NULL
  GROUP BY game_name ORDER BY gdt DESC
`).all();
console.log('\n=== orders-only games (not in games or inventory) ===');
ordGames.filter(g => !gamesTableNames.has(g.game_name) && !invNames.has(g.game_name))
  .forEach(g => console.log(`  "${g.game_name}" | ${g.gdt} | ${g.cnt} orders | €${g.rev?.toFixed(2)}`));

console.log('\n=== ALL orders game_names (for reference) ===');
ordGames.forEach(g => {
  const where = gamesTableNames.has(g.game_name) ? 'games' : invNames.has(g.game_name) ? 'inventory' : 'ORDERS-ONLY';
  console.log(`  [${where}] "${g.game_name}" | ${g.cnt} orders | €${g.rev?.toFixed(2)}`);
});
