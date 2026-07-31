const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/data/games.db');

// All orders found on StubHub today
const ALL_ORDERS = [
  // === Arsenal FC vs Fulham FC (Completed, Sat 02/05/2026 17:30) ===
  { order_number:'286966684', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:623.04,  name:'Zohaib Ratani',              email:'zoeb.ratani@hotmail.com',              cat:'Shortside Upper',           rs:'Row BEST | Seats 11, 22' },
  { order_number:'286967930', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:800.80,  name:'Paweł Bąk',                  email:'bakpawel14@gmail.com',                 cat:'Longside Upper',            rs:'Row win | Seats 11, 22' },
  { order_number:'286970904', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:691.68,  name:'Teodora-Maria Dejica-Cosovici',email:'teodorastefan27@gmail.com',           cat:'Shortside Upper',           rs:'Row BEST | Seats 1, 2' },
  { order_number:'286971784', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:700.48,  name:'LILI SHA',                   email:'lili.sha@outlook.com',                 cat:'Shortside Upper 123',       rs:'Row 398 | Seats 2, 3' },
  { order_number:'287005342', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:3, amt:1246.08, name:'Jane Loughman',               email:'jane.loughman@mac.com',               cat:'Longside Lower Central 17', rs:'Row LOWROW | Seats 1, 3, 5' },
  { order_number:'287022070', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:533.28,  name:'Salman Jawed',                email:'salmanjawed@coalesce.pk',              cat:'Longside Upper',            rs:'Row BESTVIEW | Seats 11, 17' },
  { order_number:'287022218', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:3, amt:908.16,  name:'Alex Morin',                 email:'auda.morinaud@hydropur-piscines.fr',   cat:'Longside Lower',            rs:'Row bestseats | Seats 33, 44, 55' },
  { order_number:'287022623', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:4, amt:700.48,  name:'Kethan Kandasamy',            email:'kandasamy16@hotmail.com',              cat:'Shortside Upper',           rs:'Row BESTUCANGET | Seats 11, 14, 18, 22' },
  { order_number:'287022661', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:3, amt:604.56,  name:'Topi Iltola',                email:'topi.iltola@gmail.com',               cat:'Shortside Upper',           rs:'Row WIN | Seats 15, 17, 19' },
  { order_number:'287022688', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:350.24,  name:'Hownithan Sathiyanathan',     email:'hownithan94@yahoo.com',               cat:'Shortside Upper',           rs:'Row AmazingLocation | Seats 121, 129' },
  { order_number:'287023897', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:330.88,  name:'William Destin',             email:'william.destin@icloud.com',            cat:'Longside Upper Central',    rs:'Row AA | Seats 25, 27' },
  { order_number:'287024380', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:1, amt:165.44,  name:'Jonathan Navarro',            email:'jonathan.nav4@gmail.com',             cat:'Longside Upper Central',    rs:'Row AA | Seats 29' },
  { order_number:'287029980', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:4, amt:661.76,  name:'Kevin Contreras',             email:'kevincontreras163@gmail.com',          cat:'Shortside Upper',           rs:'Row AmazingLocation | Seats 134, 136, 138, 140' },
  { order_number:'287030851', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:403.04,  name:'Ladislav Vyhnánek',          email:'lvyhnanek@gmail.com',                  cat:'Shortside Upper',           rs:'Row WIN | Seats 11, 13' },
  { order_number:'287030859', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:350.24,  name:'Banusan Jeganathan',          email:'banusan707@gmail.com',                cat:'Shortside Upper',           rs:'Row AmazingLocation | Seats 99, 111' },
  { order_number:'287030969', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:922.24,  name:'Marc De Chassey',             email:'mdechassey@finialcap.com',             cat:'Longside Lower Central 16', rs:'Row Gooners | Seats 8, 9' },
  { order_number:'287031356', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:369.60,  name:'Oliver Piha',                email:'oliver.piha@gmail.com',               cat:'Longside Upper',            rs:'Row Greatseats | Seats 1, 6' },
  { order_number:'287031361', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:350.24,  name:'Matthias Laarmann',          email:'laarmann.matthias@web.de',             cat:'Shortside Upper 106',       rs:'Row close2eachother | Seats 222, 235' },
  { order_number:'287031651', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:374.88,  name:'Zachary Brogan',             email:'zachbrogan+stubhub@gmail.com',         cat:'Longside Upper Central',    rs:'Row AA | Seats 21, 23' },
  { order_number:'287031835', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:1, amt:237.60,  name:'Shashank Bekal',             email:'shankze@gmail.com',                   cat:'Longside Lower Central 17', rs:'Row LOWROW | Seats 99' },
  { order_number:'287032252', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:2, amt:315.04,  name:'Jennifer Berg',              email:'jennpberg@gmail.com',                 cat:'Shortside Lower 6',         rs:'Row closetothefield | Seats 55, 65' },
  { order_number:'287036440', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:4, amt:591.36,  name:'Adam Wade',                  email:'adam3wade7@gmail.com',                 cat:'Shortside Upper',           rs:'Row AmazingLocation | Seats 142, 144, 155, 161' },
  { order_number:'287037143', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:3, amt:496.32,  name:'Dave Hes',                   email:'davehes1999@gmail.com',               cat:'Shortside Lower',           rs:'Row Realfansonly | Seats 222, 229, 239' },
  // Open tab - Arsenal vs Fulham
  { order_number:'287024789', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:4, amt:784.96,  name:'Isabella Dschulnigg-Geissler',email:'id@saalbacherhof.at',                cat:'Shortside Lower',           rs:'Row RealFansSeatHere | Seats 12, 22, 32, 41' },
  { order_number:'287037266', game_name:'Arsenal FC vs Fulham FC', dsh:'Sat, 02/05/2026, 17:30', qty:4, amt:788.48,  name:'Isabella Dschulnigg-Geissler',email:'id@saalbacherhof.at',                cat:'Longside Lower',            rs:'Row bestseats | Seats 66, 68, 70, 72' },

  // === Brentford FC vs West Ham United FC (Open, Sat 02/05/2026 15:00) ===
  { order_number:'286948665', game_name:'Brentford FC vs West Ham United FC', dsh:'Sat, 02/05/2026, 15:00', qty:2, amt:200.64, name:'Eimi Smith',    email:'eimipsmith@yahoo.com',          cat:'Longside Lower',  rs:'Row BRE | General Admission' },
  { order_number:'286967907', game_name:'Brentford FC vs West Ham United FC', dsh:'Sat, 02/05/2026, 15:00', qty:2, amt:186.56, name:'Jonas Wielert', email:'Jonas.wielert@gmx.de',          cat:'Shortside Lower', rs:'Row BRE | General Admission' },
  { order_number:'286973275', game_name:'Brentford FC vs West Ham United FC', dsh:'Sat, 02/05/2026, 15:00', qty:2, amt:186.56, name:'j.d. f. f.',    email:'jdfernandez1983@gmail.com',     cat:'Shortside Lower', rs:'Row BRE | General Admission' },
  { order_number:'286973372', game_name:'Brentford FC vs West Ham United FC', dsh:'Sat, 02/05/2026, 15:00', qty:2, amt:188.32, name:'Nicolas BARLETTA',email:'nicolasjr.barletta@gmail.com', cat:'Shortside Lower', rs:'Row BRE | General Admission' },

  // === Chelsea FC vs Nottingham Forest FC (Open, Mon 04/05/2026 15:00) ===
  { order_number:'287032691', game_name:'Chelsea FC vs Nottingham Forest FC', dsh:'Mon, 04/05/2026, 15:00', qty:2, amt:260.48, name:'Edmund Kotia',     email:'edmund.kotia@yahoo.ca',      cat:'Longside Lower', rs:'Row Cfc1 | Seats 33, 35' },
  { order_number:'287028753', game_name:'Chelsea FC vs Nottingham Forest FC', dsh:'Mon, 04/05/2026, 15:00', qty:2, amt:279.84, name:'Antonio Guzmán',   email:'antonioipn7@hotmail.com',     cat:'Longside Lower', rs:'Row chelsea | Seats 56, 66' },
  { order_number:'287031201', game_name:'Chelsea FC vs Nottingham Forest FC', dsh:'Mon, 04/05/2026, 15:00', qty:2, amt:279.84, name:'Utku Güçlü',       email:'utkuguclu066@gmail.com',      cat:'Longside Lower', rs:'Row chelsea | Seats 84, 86' },

  // === Arsenal vs Atlético de Madrid - Champions League 2025-2026 (Open, Tue 05/05/2026 20:00) ===
  { order_number:'287024679', game_name:'Arsenal vs Atlético de Madrid - Champions League 2025-2026', dsh:'Tue, 05/05/2026, 20:00', qty:2, amt:1462.56, name:'Piotr Osiecki', email:'Posieckiosa@outlook.com', cat:'Longside Upper Central 92', rs:'Row LOWROW | Seats 5, 6' },

  // === Fulham FC vs AFC Bournemouth (Open, Sat 09/05/2026 15:00) ===
  { order_number:'286992673', game_name:'Fulham FC vs AFC Bournemouth', dsh:'Sat, 09/05/2026, 15:00', qty:2, amt:149.60, name:'Steven Carey', email:'scarey414@gmail.com', cat:'Shortside', rs:'Row FULHAM | General Admission' },

  // === FA Cup Final - Chelsea FC vs Manchester City FC (Open, Sat 16/05/2026 17:00) ===
  { order_number:'287030502', game_name:'FA Cup Final - Chelsea FC vs Manchester City FC', dsh:'Sat, 16/05/2026, 17:00', qty:2, amt:462.88, name:'Claudio Da Costa',   email:'claudio3@usf.edu',         cat:'Longside Upper Tier',  rs:'Row BESTVALUE | Seats 2, 3' },
  { order_number:'287023293', game_name:'FA Cup Final - Chelsea FC vs Manchester City FC', dsh:'Sat, 16/05/2026, 17:00', qty:2, amt:413.60, name:'Fabian Linhardt',    email:'hans.schiller56@web.de',   cat:'Shortside Upper Tier', rs:'Row AAA | Seats 5, 6' },
  { order_number:'287023802', game_name:'FA Cup Final - Chelsea FC vs Manchester City FC', dsh:'Sat, 16/05/2026, 17:00', qty:2, amt:457.60, name:'oscar eugeni',        email:'noeugenin@gmail.com',       cat:'Longside Upper Tier',  rs:'Row GA | Seats 9, 10' },
  { order_number:'287031995', game_name:'FA Cup Final - Chelsea FC vs Manchester City FC', dsh:'Sat, 16/05/2026, 17:00', qty:2, amt:397.76, name:'FILIMON PAIPETIS',   email:'filis_1959@hotmail.com',   cat:'Shortside Upper Tier', rs:'Row GO | Seats 1, 2' },

  // === Arsenal FC vs Burnley FC (Open, Mon 18/05/2026 20:00) ===
  { order_number:'287032809', game_name:'Arsenal FC vs Burnley FC', dsh:'Mon, 18/05/2026, 20:00', qty:2, amt:938.08,  name:'Edwin Medina',   email:'ed36med36@gmail.com',     cat:'Shortside Upper 117', rs:'Row BestInTheShortside | Seats 22, 23' },
  { order_number:'287032282', game_name:'Arsenal FC vs Burnley FC', dsh:'Mon, 18/05/2026, 20:00', qty:2, amt:614.24,  name:'Mohit Gambani',  email:'mohitgambani4@gmail.com', cat:'Shortside Upper',     rs:'Row CH | Seats 1, 2' },
  { order_number:'287024164', game_name:'Arsenal FC vs Burnley FC', dsh:'Mon, 18/05/2026, 20:00', qty:1, amt:296.56,  name:'Syed Raza',      email:'sadiraza@yahoo.com',      cat:'Shortside Upper',     rs:'Row WINNERS | Seats 33' },

  // === Brentford FC vs Crystal Palace FC (Open, Sun 17/05/2026 15:00) ===
  { order_number:'286965066', game_name:'Brentford FC vs Crystal Palace FC', dsh:'Sun, 17/05/2026, 15:00', qty:2, amt:232.32, name:'Heather Roberts', email:'hlr@sfu.ca',         cat:'Longside Lower', rs:'Row BRE | General Admission' },
  { order_number:'286975850', game_name:'Brentford FC vs Crystal Palace FC', dsh:'Sun, 17/05/2026, 15:00', qty:2, amt:237.60, name:'Oksana Vovchuk',  email:'vovoksana@gmail.com', cat:'Longside Lower', rs:'Row BRE | General Admission' },
];

// Step 1: Get existing order numbers
const existingNums = new Set(
  db.prepare("SELECT order_number FROM orders WHERE deleted_at IS NULL").all().map(r => r.order_number)
);
console.log(`\nExisting orders in DB: ${existingNums.size}`);

// Step 2: Get existing game_datetime per game_name
const dtMap = {};
db.prepare("SELECT game_name, game_datetime FROM orders WHERE deleted_at IS NULL AND game_datetime IS NOT NULL GROUP BY game_name ORDER BY game_name").all()
  .forEach(r => { if (!dtMap[r.game_name]) dtMap[r.game_name] = r.game_datetime; });

console.log('\nExisting game datetimes in DB:');
Object.entries(dtMap).forEach(([n,d]) => console.log(`  "${n}" → "${d}"`));

// Step 3: Insert missing orders
let inserted = 0, skipped = 0;
const stmt = db.prepare(`
  INSERT INTO orders (game_name, game_datetime, ticket_quantity, total_amount, buyer_name, buyer_email, order_number, sales_channel, category, row_seat)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'StubHub', ?, ?)
`);

for (const o of ALL_ORDERS) {
  if (existingNums.has(o.order_number)) {
    skipped++;
    continue;
  }
  // Use existing datetime if available for this game, else use the StubHub one
  const dt = dtMap[o.game_name] || o.dsh;
  stmt.run(o.game_name, dt, o.qty, o.amt, o.name, o.email, o.order_number, o.cat, o.rs);
  console.log(`✅ Inserted ${o.order_number} | ${o.game_name} | ${o.name} | €${o.amt}`);
  inserted++;
}

console.log(`\nDone: ${inserted} inserted, ${skipped} skipped (already in DB)`);

// Step 4: Summary per game
console.log('\n--- New orders by game ---');
const summary = {};
for (const o of ALL_ORDERS) {
  if (!existingNums.has(o.order_number)) {
    if (!summary[o.game_name]) summary[o.game_name] = { count:0, total:0 };
    summary[o.game_name].count++;
    summary[o.game_name].total += o.amt;
  }
}
Object.entries(summary).forEach(([g,s]) => console.log(`  ${g}: ${s.count} orders, €${s.total.toFixed(2)}`));
