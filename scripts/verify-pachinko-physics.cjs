/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS verification. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../components/pachi/pachinko-physics.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const physics = { exports: {} };
new Function('exports', 'require', 'module', compiled)(physics.exports, require, physics);
const { createBallFlight, sampleBallFlight, BOARD_PINS, BALL_TARGETS, BALL_RADIUS, distanceToBallSegment } = physics.exports;
function seed(value) { return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
function launch(power, mode = 'normal', attackerOpen = false, random = seed(1)) { return createBallFlight({ id: 1, power, mode, attackerOpen }, random); }
function lcdCrosses(a, b) {
  // Liang-Barsky rectangle intersection, including the metal ball's radius.
  const rect = [100 - BALL_RADIUS, 500 + BALL_RADIUS, 115 - BALL_RADIUS, 390 + BALL_RADIUS];
  let lo = 0, hi = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - rect[0]], [dx, rect[1] - a.x], [-dy, a.y - rect[2]], [dy, rect[3] - a.y]]) {
    if (!p) { if (q < 0) return false; continue; }
    const ratio = q / p;
    if (p < 0) lo = Math.max(lo, ratio); else hi = Math.min(hi, ratio);
    if (lo > hi) return false;
  }
  return true;
}
let cases = 0;
function check(name, fn) { fn(); cases++; console.log(`PASS ${name}`); }
check('a seeded launch is fully reproducible', () => assert.deepEqual(launch(56), launch(56)));
check('left/right handle strengths select distinct lanes', () => {
  assert.equal(launch(56).lane, 'left');
  assert.equal(launch(88, 'rush').lane, 'right');
  assert.equal(launch(10).lane, 'right');
});
check('all arrivals equal their selected physical cup', () => {
  for (const [power, mode, open] of [[56, 'normal', false], [88, 'rush', false], [88, 'rush', true]]) {
    for (const chance of [.01, .25, .60, .85]) {
      const flight = launch(power, mode, open, () => chance);
      assert.deepEqual(sampleBallFlight(flight, 0), { x: 568, y: 602 });
      assert.deepEqual(sampleBallFlight(flight, 1), BALL_TARGETS[flight.target]);
      assert.deepEqual(sampleBallFlight(flight, 2), BALL_TARGETS[flight.target]);
      assert.deepEqual(sampleBallFlight(flight, -1), { x: 568, y: 602 });
    }
  }
});
check('closed attacker can never award an attacker arrival', () => {
  for (let i = 0; i < 100; i++) assert.notEqual(launch(88, 'rush', false, seed(i)).target, 'attacker');
  assert.equal(launch(88, 'rush', true, () => .1).target, 'attacker');
});
check('1,200 trajectories stay inside the cabinet, outside LCD and outside solid nails', () => {
  const rng = seed(19273);
  for (let i = 0; i < 1200; i++) {
    const flight = launch(i % 101, i % 3 ? 'normal' : 'rush', i % 7 === 0, rng);
    assert.ok(flight.durationMs > 500 && flight.durationMs < 10000, `duration ${flight.durationMs}`);
    assert.ok(flight.points.length > 30 && flight.points.length < 2000);
    for (let j = 0; j < flight.points.length; j++) {
      const point = flight.points[j];
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= BALL_RADIUS && point.x <= 600 - BALL_RADIUS && point.y >= BALL_RADIUS && point.y <= 620 - BALL_RADIUS, `bounds ${JSON.stringify(point)}`);
      if (!j) continue;
      const a = flight.points[j - 1];
      assert.ok(!lcdCrosses(a, point), `LCD flight ${i} segment ${j} ${JSON.stringify([a, point])}`);
      for (const pin of BOARD_PINS) {
        const radius = pin.r + BALL_RADIUS;
        if (pin.x < Math.min(a.x, point.x) - radius || pin.x > Math.max(a.x, point.x) + radius || pin.y < Math.min(a.y, point.y) - radius || pin.y > Math.max(a.y, point.y) + radius) continue;
        const d = distanceToBallSegment(pin, a, point);
        assert.ok(d >= radius - .01, `pin flight ${i} segment ${j} pin ${JSON.stringify(pin)} distance ${d}`);
      }
    }
  }
});
check('correct handle strength gives useful entry and excess strength reduces it', () => {
  const count = (power, mode, open) => {
    let entry = 0; const rng = seed(45);
    for (let i = 0; i < 2000; i++) if (['start', 'attacker'].includes(launch(power, mode, open, rng).target)) entry++;
    return entry / 2000;
  };
  const normal = count(56, 'normal', false);
  assert.ok(normal > .17 && normal < .27, `normal ${normal}`);
  assert.ok(count(88, 'normal', false) < .04);
  assert.ok(count(88, 'rush', true) > .65);
});
console.log(`Verified ${cases} pachinko physics checks.`);
