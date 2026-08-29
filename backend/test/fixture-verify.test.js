const assert = require('node:assert');
const { sameTie } = require('../services/fixture-verify');

// Two fixtures are the same tie only when BOTH sides match.
assert.ok(sameTie({ home: 'Newcastle United', away: 'Liverpool' },
                  { home: 'Newcastle Utd',    away: 'Liverpool FC' }));
assert.ok(sameTie({ home: 'Arsenal FC', away: 'Coventry City FC' },
                  { home: 'Arsenal',    away: 'Coventry City' }));

// One shared team is NOT a match — this is the assumption that merged Newcastle/West Brom
// into Newcastle/West Ham on the orders side (2026-08-25).
assert.ok(!sameTie({ home: 'Newcastle United', away: 'West Bromwich Albion' },
                   { home: 'Newcastle United', away: 'West Ham United' }));

// Different fixture entirely
assert.ok(!sameTie({ home: 'Crystal Palace', away: 'Manchester City' },
                   { home: 'Brentford',      away: 'Crystal Palace' }));

// Missing side never matches
assert.ok(!sameTie({ home: 'Arsenal', away: '' }, { home: 'Arsenal', away: 'Chelsea' }));

console.log('fixture-verify: all assertions passed');

// Regression: the DB row shape (home_team/away_team) must compare equal to the provider
// shape (home/away). Reading only .home/.away made every comparison undefined-vs-undefined
// and declared all 40 fixtures missing on the first live run.
assert.ok(sameTie({ home_team: 'Bournemouth', away_team: 'Everton' },
                  { home: 'Bournemouth',      away: 'Everton' }));
assert.ok(sameTie({ home_team: 'Liverpool', away_team: 'Nottingham' },
                  { home: 'Liverpool',      away: 'Nottingham Forest' }));
assert.ok(!sameTie({ home_team: 'Liverpool', away_team: 'Everton' },
                   { home: 'Liverpool',      away: 'Nottingham Forest' }));
console.log('fixture-verify: db-row shape assertions passed');
