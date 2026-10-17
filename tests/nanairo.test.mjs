import assert from "node:assert/strict";
import test from "node:test";
import {
  NANAIRO, NANAIRO_PITCHES, createNanairo, drawNanairoPitch, playNanairo,
  nanairoRelease, nanairoWhiffRate, nanairoPoints, nanairoTrajectory, validateNanairoInput, nanairoCourse, normalizeNanairo, nanairoBatter, nanairoOutcomeLabel,
} from "../lib/games/nanairo.ts";

const sequence = (...values) => { let index = 0; return () => values[index++] ?? 0.99; };
function stateFor(batterId = "kawanabe", pitchId = "normal") {
  const others = ["yamaki", "kan", "kawanabe", "ikehara", "misawa", "kobayashi"].filter(id => id !== batterId);
  return { kind: "nanairo", lineup: [batterId, ...others.slice(0, 4)], history: [], total: 0, streak: 0,
    ready: { batterId, pitchId, direction: 1, releaseMs: 1900 } };
}
const result = (state, random) => playNanairo(state, { x: 50, y: 50 }, 1900, random).history[0];

test("pitch weights exactly match the specified 100% distribution", () => {
  assert.equal(NANAIRO_PITCHES.reduce((sum, pitch) => sum + pitch.weight, 0), 100);
  assert.equal(NANAIRO_PITCHES.length, 7);
  assert(NANAIRO_PITCHES.every(pitch => !["straight", "slider", "curve"].includes(pitch.id)));
  const counts = Object.fromEntries(NANAIRO_PITCHES.map(pitch => [pitch.id, 0]));
  for (let index = 0; index < 10_000; index++) counts[drawNanairoPitch(() => (index + 0.5) / 10_000)]++;
  for (const pitch of NANAIRO_PITCHES) assert.equal(counts[pitch.id], pitch.weight * 100);
  assert.equal(NANAIRO_PITCHES.filter(pitch => pitch.sinker).reduce((sum, pitch) => sum + pitch.weight, 0), 100);
});

test("release boundaries cover fractional milliseconds without gaps", () => {
  for (const [error, judgement, rate] of [[0, "PERFECT", 38], [10, "PERFECT", 38], [-10, "PERFECT", 38],
    [10.001, "GOOD", 43], [-10.001, "GOOD", 43], [20, "GOOD", 43], [-20, "GOOD", 43],
    [30, "GOOD", 43], [-30, "GOOD", 43], [40, "GOOD", 43], [-40, "GOOD", 43],
    [40.001, "MISS", 73], [-40.001, "MISS", 73],
    [60, "MISS", 73], [-60, "MISS", 73]]) {
    assert.deepEqual(nanairoRelease(error, "ultimate"), { judgement, misthrowRate: rate });
  }
});

test("independent 2% rare appearances remain confined to fourth and fifth slots", () => {
  const normal=createNanairo(sequence(.02,.02));
  assert.equal(normal.lineup.length,5);
  assert.equal(new Set(normal.lineup).size,5);
  assert(!normal.lineup.includes("ishihata") && !normal.lineup.includes("abe"));
  const ishihata=createNanairo(sequence(.019999,.99));
  const abe=createNanairo(sequence(.99,.019999));
  const both=createNanairo(sequence(0,0));
  assert.equal(ishihata.lineup[3],"ishihata");
  assert(!ishihata.lineup.includes("abe"));
  assert.equal(abe.lineup[4],"abe");
  assert(!abe.lineup.includes("ishihata"));
  assert.equal(both.lineup[4],"abe");
  assert.equal(both.lineup[3],"ishihata");
  assert.equal(new Set(both.lineup).size,5);
  assert.equal(both.ready.batterId,both.lineup[0]);
  let ishihataCount=0,abeCount=0;
  for(let i=0;i<1000;i++) {
    ishihataCount+=Number(createNanairo(sequence((i+.5)/1000,.99)).lineup.includes("ishihata"));
    abeCount+=Number(createNanairo(sequence(.99,(i+.5)/1000)).lineup.includes("abe"));
  }
  assert.equal(ishihataCount,20); assert.equal(abeCount,20);
});

test("Kitazawa's ordinary selection weight is 0.8 and all five opponents remain unique",()=>{
  const firstCounts={};
  for(let i=0;i<7800;i++) {
    const state=createNanairo(sequence(.99,.99,(i+.5)/7800));
    assert.equal(new Set(state.lineup).size,5);
    const first=state.lineup[0]; firstCounts[first]=(firstCounts[first]??0)+1;
  }
  assert.equal(firstCounts.kitazawa,800);
  for(const id of ["yamaki","kan","kawanabe","ikehara","misawa","kobayashi","chiaki"]) assert.equal(firstCounts[id],1000);
});

test("course matchups remain effective and Yamaki/Kawanabe are strong only against ultimate sinkers", () => {
  const center={x:50,y:50};
  assert.equal(nanairoWhiffRate("normal","yamaki",{x:85,y:50}), nanairoWhiffRate("normal","chiaki",center));
  // ミート6の池原は通常シンカーの計算値2%が下限3%に補正される。
  const ikeharaNormal=nanairoWhiffRate("normal","ikehara",center);
  const ikeharaUltimate=nanairoWhiffRate("ultimate","ikehara",center);
  assert.equal(ikeharaNormal,.03);
  assert(Math.abs(ikeharaUltimate-.42)<1e-9);
  assert(Math.abs(ikeharaUltimate-ikeharaNormal-.39)<1e-9);
  assert(nanairoWhiffRate("normal","misawa",{x:50,y:85})<nanairoWhiffRate("normal","kan",{x:85,y:50}));
  assert(nanairoWhiffRate("normal","kan",{x:16,y:85})>nanairoWhiffRate("normal","kan",center));
  assert(nanairoWhiffRate("normal","kan",center,10)<nanairoWhiffRate("normal","kan",center,3));
  for (const id of ["yamaki","kawanabe"]) {
    const meet=nanairoBatter(id).meet;
    assert(Math.abs(nanairoWhiffRate("ultimate","chiaki",center,meet)-nanairoWhiffRate("ultimate",id,center)-.4)<1e-9,id);
    for (const elapsed of [1900,1930,2000]) {
      const ultimate=playNanairo(stateFor(id,"ultimate"),center,elapsed,sequence(.99,0,.99,.75,0)).history[0];
      const normal=playNanairo(stateFor(id,"normal"),center,elapsed,sequence(.99,0,.99,.75,0)).history[0];
      assert(Math.abs(ultimate.whiffRate-normal.whiffRate)<1e-9,id);
      assert.equal(ultimate.outcome,"homer",id);
      assert.equal(normal.outcome,"out",id);
      for (const pitch of NANAIRO_PITCHES.filter(pitch=>pitch.id!=="ultimate")) {
        const other=playNanairo(stateFor(id,pitch.id),center,elapsed,sequence(.99,0,.99,.75,0)).history[0];
        assert.equal(other.outcome,"out",`${id}, ${pitch.id}, ${elapsed}`);
      }
    }
  }
});

test("PERFECT still allows hits and home runs", () => {
  const pitch = result(stateFor(), sequence(0.99, 0, 0.99, 0, 0));
  assert.equal(pitch.judgement, "PERFECT");
  assert.equal(pitch.misthrow, false);
  assert.deepEqual(pitch.landing, pitch.target);
  assert.equal(pitch.outcome, "homer");
  assert.equal(pitch.points, -2000);
});

test("misthrow boundary, wild-pitch walks and chase strikeouts", () => {
  assert.equal(result(stateFor("kawanabe", "ultimate"), sequence(0.379999)).misthrow, true);
  assert.equal(result(stateFor("kawanabe", "ultimate"), sequence(0.38)).misthrow, false);
  const wild = result(stateFor(), sequence(0, 0, 0.999, 0.99));
  assert.equal(wild.wild, true);
  assert.equal(wild.outcome, "walk");
  assert.equal(wild.points, -500);
  const chase = result(stateFor(), sequence(0, 0, 0.3, 0, 0));
  assert(chase.landing.x > 100);
  assert.equal(chase.wild, false);
  assert.equal(chase.outcome, "swing-k");
});

test("both gamblers have base P2/M2 and a 15% chance to raise both abilities to 10", () => {
  for (const id of ["kan", "kobayashi"]) {
    const boosted = result(stateFor(id), sequence(.99, .149999, 0, 0));
    assert.equal(boosted.power, 10);
    assert.equal(boosted.meet, 10);
    assert.equal(boosted.limitBreak, "both");
    const normal = result(stateFor(id), sequence(.99, .15));
    assert.equal(normal.limitBreak, null);
    assert.equal(normal.power, 2);
    assert.equal(normal.meet, 2);
    let triggers = 0;
    for (let index = 0; index < 1000; index++) triggers += Number(result(stateFor(id), sequence(.99, (index + .5) / 1000)).limitBreak === "both");
    assert.equal(triggers, 150);
  }
});

test("base scoring and streak/lucky bonuses no longer include the ultimate strikeout bonus", () => {
  for (const [outcome, points] of [["swing-k", 1000], ["looking-k", 800], ["out", 500], ["single", -500], ["double", -1000], ["triple", -1500], ["walk", -500], ["homer", -2000]]) {
    assert.equal(nanairoPoints(outcome, "normal", "kawanabe", 0).points, points);
  }
  assert.equal(nanairoPoints("swing-k", "normal", "kawanabe", 1).comboBonus, 500);
  for (const previous of [2, 3, 4]) assert.equal(nanairoPoints("swing-k", "normal", "kawanabe", previous).comboBonus, 1000);
  const stacked = nanairoPoints("looking-k", "ultimate", "ishihata", 2);
  assert.equal(stacked.points, 4200);
  assert.equal(stacked.magicBonus, 0);
  assert.equal(stacked.luckyBonus, 1000);
  assert.equal(nanairoPoints("walk", "ultimate", "ishihata", 4).streak, 0);
  assert.equal(nanairoPoints("walk", "ultimate", "ishihata", 4).magicBonus, 0);
  const ordinaryOut = nanairoPoints("out", "ultimate", "ishihata", 4);
  assert.equal(ordinaryOut.points, 2250);
  assert.equal(ordinaryOut.streak, 0);
});

test("pitch multipliers apply to every outcome, including negative points and all plate-appearance bonuses", () => {
  const multipliers={normal:1,fast:1,drop:1,side:1,zigzag:1.2,vanish:1.2,ultimate:1.5};
  for(const [id,multiplier] of Object.entries(multipliers)) {
    const definition=NANAIRO_PITCHES.find(pitch=>pitch.id===id);
    assert.equal(definition.multiplier,multiplier,id);
    for(const [outcome,base] of [["swing-k",1000],["looking-k",800],["out",500],["single",-500],["double",-1000],["triple",-1500],["homer",-2000],["walk",-500]]) {
      const score=nanairoPoints(outcome,id,"kawanabe",0);
      assert.equal(score.multiplier,multiplier);
      assert.equal(score.magicBonus,0);
      assert.equal(score.points,base*multiplier,`${id}: ${outcome}`);
    }
    const streakAndCourse=nanairoPoints("swing-k",id,"kawanabe",1,{x:50,y:50});
    assert.equal(streakAndCourse.points,1900*multiplier);
    const luckyAndStreak=nanairoPoints("looking-k",id,"abe",2,{x:50,y:50});
    assert.equal(luckyAndStreak.points,3300*multiplier);
    assert.equal(nanairoPoints("out",id,"kitazawa",0).points,500*multiplier);
    assert.equal(nanairoPoints("swing-k",id,"kitazawa",1,{x:50,y:50}).points,2300*multiplier);
    assert.equal(nanairoPoints("swing-k",id,"kitazawa",1,{x:50,y:50},"PERFECT").points,2800*multiplier);
    assert.equal(nanairoPoints("looking-k",id,"abe",2,{x:50,y:50},"PERFECT").points,3800*multiplier);
  }
});

test("actual pitch multipliers affect only the current batter's points, never the accumulated total", () => {
  const initial={...stateFor("kawanabe","ultimate"),total:777,streak:1};
  const afterUltimate=playNanairo(initial,{x:50,y:50},1900,()=>.99);
  assert.equal(afterUltimate.history[0].points,3300);
  assert.equal(afterUltimate.history[0].multiplier,1.5);
  assert.equal(afterUltimate.total,4077);
  const normalReady={...afterUltimate,ready:{...afterUltimate.ready,pitchId:"normal"}};
  const afterNormal=playNanairo(normalReady,{x:50,y:50},normalReady.ready.releaseMs,()=>.99);
  assert.equal(afterNormal.history[1].points,2700);
  assert.equal(afterNormal.total,6777);
  assert.deepEqual(afterNormal.history[0],afterUltimate.history[0]);
  const homer=playNanairo({...initial,streak:0},{x:50,y:50},1900,sequence(.99,0,.99,0,0));
  assert.equal(homer.history[0].points,-3000);
  assert.equal(homer.total,-2223);
});

test("exactly five one-pitch plate appearances, resumable state and no early negative clamping", () => {
  let state = createNanairo(() => 0.99);
  for (let index = 0; index < 5; index++) {
    const before = structuredClone(state);
    state = playNanairo(state, { x: 50, y: 50 }, state.ready.releaseMs, () => 0.99);
    assert.equal(state.history.length, index + 1);
    assert.deepEqual(before.history.length, index);
    assert.equal(state.history[index].batterId, state.lineup[index]);
    assert.equal(Boolean(state.ready), index < 4);
  }
  assert.equal(state.total, 18000);
  assert.equal(state.streak, 5);
  assert.throws(() => playNanairo(state, { x: 50, y: 50 }, 1900, () => 0.99));
  let negative = playNanairo(stateFor(), { x: 50, y: 50 }, 1900, sequence(0.99, 0, 0.99, 0, 0));
  assert.equal(negative.total, -2000);
  negative = { ...negative, ready: { ...negative.ready, pitchId: "normal" } };
  negative = playNanairo(negative, { x: 50, y: 50 }, negative.ready.releaseMs, () => 0.99);
  assert.equal(negative.total, -300);
});

test("all ten batters' nine-cell colors exactly match their declared strengths and weaknesses", () => {
  const patterns={
    yamaki:"WSSWSSWWW", kan:"WWWSSSWWW", kawanabe:"SSWSSWWWW", ikehara:"SSSSSSWWW",
    misawa:"WWWWWWSSS", kobayashi:"WWWSSSWWW", ishihata:"WWWWWWWWW",
    chiaki:"SSSSSSWWW", abe:"WWWWWWWWW", kitazawa:"SSWSSWSSW",
  };
  const keys={S:"strong",W:"weak",N:"neutral"};
  for(const [id,pattern] of Object.entries(patterns)) {
    assert.equal(pattern.length,9);
    for(let i=0;i<9;i++) {
      const point={x:(i%3+.5)*100/3,y:(Math.floor(i/3)+.5)*100/3};
      const course=nanairoCourse(id,point);
      assert.equal(course.affinity,keys[pattern[i]],`${id}, cell ${i+1}`);
      if(course.affinity==="strong") assert(course.hitBonus>0 && course.whiffBonus<0);
      if(course.affinity==="weak") assert(course.hitBonus<0 && course.whiffBonus>0);
      if(course.affinity==="neutral") {
        assert.equal(course.hitBonus,0);
        assert.equal(course.whiffBonus,0);
      }
      for(const outcome of ["swing-k","looking-k"]) {
        assert.equal(nanairoPoints(outcome,"normal",id,0,point).courseBonus,pattern[i]==="S" ? 400 : 0,`${id}, cell ${i+1}`);
      }
    }
  }
  assert.equal(nanairoCourse("kitazawa",{x:50,y:120}).affinity,"neutral");
  assert.equal(nanairoCourse("ikehara",{x:0,y:0}).affinity,"strong");
  assert.equal(nanairoCourse("ikehara",{x:100,y:100}).affinity,"weak");
  assert.equal(nanairoCourse("kan",{x:100,y:100}).affinity,"weak");
  assert(nanairoCourse("misawa",{x:50,y:85}).hitBonus>nanairoCourse("ikehara",{x:50,y:16}).hitBonus);
});

test("numbered course matchups affect hits, strikeouts and bonuses in actual pitches", () => {
  // Yamaki: courses 6 and 2 are strong, course 1 is weak.
  for(const [point,outcome,bonus] of [[{x:83.33,y:50},"homer",400],[{x:50,y:16.67},"homer",400],[{x:16.67,y:16.67},"swing-k",0]]) {
    const pitch=playNanairo(stateFor("yamaki"),point,1900,sequence(.99,0,.5,.55,0)).history[0];
    assert.equal(pitch.outcome,outcome);
    assert.equal(pitch.courseBonus,0);
    const strikeout=playNanairo(stateFor("yamaki"),point,1900,sequence(.99,0,0)).history[0];
    assert.equal(strikeout.outcome,"swing-k");
    assert.equal(strikeout.courseBonus,bonus);
  }
});

test("every animated trajectory preserves its authoritative endpoint and has a distinct shape", () => {
  const landing = { x: 12, y: 85 };
  const shapes = new Set();
  for (const pitch of NANAIRO_PITCHES) {
    const start = nanairoTrajectory(pitch.id, landing, 1, 0);
    assert.deepEqual(start, { x: 50, y: -90 });
    for (const direction of [-1, 1]) {
      const end = nanairoTrajectory(pitch.id, landing, direction, 1);
      assert(Math.abs(end.x - landing.x) < 1e-10);
      assert(Math.abs(end.y - landing.y) < 1e-10);
    }
    shapes.add(JSON.stringify(nanairoTrajectory(pitch.id, landing, 1, 0.35)));
  }
  assert.equal(shapes.size, 7);
});

test("rejects malformed aims and times instead of trusting client scores", () => {
  for (const target of [null, [], {}, { x: NaN, y: 50 }, { x: Infinity, y: 50 }, { x: -1, y: 50 }, { x: 50, y: 101 }, { x: "50", y: 50 }]) {
    assert.throws(() => validateNanairoInput(target, 1900));
  }
  for (const elapsed of [-1, NaN, Infinity, "1900", NANAIRO.maxReleaseMs + 1]) assert.throws(() => validateNanairoInput({ x: 50, y: 50 }, elapsed));
  assert.deepEqual(validateNanairoInput({ x: 0, y: 100 }, 0), { target: { x: 0, y: 100 }, elapsedMs: 0 });
  assert.throws(() => createNanairo(() => 1));
});
test("retired prepared pitches normalize without discarding previous results", () => {
  for (const id of ["straight", "slider", "curve"]) {
    const old = stateFor("kawanabe", id);
    const restored = normalizeNanairo(old);
    assert.equal(restored.ready.pitchId, "normal");
    assert.equal(old.ready.pitchId, id);
    assert.deepEqual(restored.lineup, old.lineup);
    assert.deepEqual(restored.history, old.history);
    assert.equal(restored.ready.releaseMs, old.ready.releaseMs);
  }
});

test("strong-course bonus requires a strikeout at the actual in-zone landing", () => {
  assert.equal(nanairoPoints("swing-k", "normal", "kan", 0, {x:50,y:50}).courseBonus,400);
  assert.equal(nanairoPoints("looking-k", "normal", "misawa", 0, {x:50,y:85}).courseBonus,400);
  for (const point of [{x:10,y:10},{x:50,y:85},{x:50,y:120}]) {
    assert.equal(nanairoPoints("swing-k", "normal", "kan", 0, point).courseBonus,0);
  }
  for (const outcome of ["out","single","double","triple","homer","walk"]) {
    assert.equal(nanairoPoints(outcome,"normal","kan",0,{x:50,y:50}).courseBonus,0);
  }
  const settled=playNanairo(stateFor(),{x:50,y:50},1900,()=>.99).history[0];
  assert.equal(settled.courseBonus,400);
});

test("Ishihata and Abe earn out bonuses, while Kitazawa earns 400 only for strikeouts", () => {
  for (const [id,bonus] of [["ishihata",1000],["abe",1500]]) {
    for (const outcome of ["swing-k","looking-k","out"]) assert.equal(nanairoPoints(outcome,"normal",id,0).luckyBonus,bonus);
    for (const outcome of ["single","double","triple","homer","walk"]) assert.equal(nanairoPoints(outcome,"normal",id,0).luckyBonus,0);
  }
  for (const outcome of ["swing-k","looking-k"]) assert.equal(nanairoPoints(outcome,"normal","kitazawa",0).luckyBonus,400);
  for (const outcome of ["out","single","double","triple","homer","walk"]) assert.equal(nanairoPoints(outcome,"normal","kitazawa",0).luckyBonus,0);
  assert.equal(nanairoPoints("out","ultimate","ishihata",4).magicBonus,0);
  const settled=playNanairo(stateFor("kitazawa"),{x:50,y:50},1900,()=>.99);
  assert.equal(settled.history[0].outcome,"looking-k");
  assert.equal(settled.history[0].luckyBonus,400);
  assert.equal(settled.history[0].points,2100);
  assert.equal(settled.total,2100);
  const ordinaryOut=playNanairo(stateFor("kitazawa"),{x:50,y:50},1900,sequence(.99,0,.99,.99)).history[0];
  assert.equal(ordinaryOut.outcome,"out");
  assert.equal(ordinaryOut.luckyBonus,0);
  assert.equal(ordinaryOut.perfectBonus,0);
  assert.equal(ordinaryOut.points,500);
});

test("PERFECT improves the matchup and adds 500 points only for swing or looking strikeouts", () => {
  const ready=stateFor();
  const perfect=playNanairo(ready,{x:50,y:50},1900,sequence(.99,0,.215)).history[0];
  const good=playNanairo(ready,{x:50,y:50},1930,sequence(.99,0,.215)).history[0];
  assert.equal(perfect.outcome,"swing-k");
  assert.equal(perfect.perfectBonus,500);
  assert.equal(perfect.points,1900);
  assert.notEqual(good.outcome,"swing-k");
  const perfectContact=playNanairo(ready,{x:50,y:50},1900,sequence(.99,0,.99,.655,0)).history[0];
  const goodContact=playNanairo(ready,{x:50,y:50},1930,sequence(.99,0,.99,.655,0)).history[0];
  assert.equal(perfectContact.outcome,"out");
  assert.equal(perfectContact.perfectBonus,0);
  assert.equal(goodContact.outcome,"homer");
  for (const [elapsed, judgement, bonus] of [[1900,"PERFECT",500],[1930,"GOOD",0],[2000,"MISS",0]]) {
    const looking=playNanairo(ready,{x:50,y:50},elapsed,()=>.99).history[0];
    const swinging=playNanairo(ready,{x:50,y:50},elapsed,sequence(.99,0,0)).history[0];
    for (const pitch of [looking,swinging]) {
      assert.equal(pitch.judgement,judgement);
      assert.equal(pitch.perfectBonus,bonus);
      assert.equal(pitch.points,pitch.basePoints+400+bonus);
    }
    assert.equal(looking.outcome,"looking-k");
    assert.equal(swinging.outcome,"swing-k");
  }
});

test("lucky batters have exactly 95% outs and 5% out-of-park homers on clean PERFECT or GOOD",()=>{
  for(const id of ["ishihata","abe"]) {
    assert.equal(nanairoBatter(id).power,1); assert.equal(nanairoBatter(id).meet,1);
    for(const elapsed of [1900,1930]) {
      let outs=0,homers=0;
      for(let i=0;i<1000;i++) {
        const r=playNanairo(stateFor(id),{x:50,y:50},elapsed,sequence(.99,(i+.5)/1000,.99)).history[0];
        if(r.outcome==="homer") {
          homers++; assert.equal(r.outOfPark,true); assert.equal(r.points,-10000);
          assert.equal(nanairoOutcomeLabel(r),"場外ホームラン…！");
        } else {
          outs++; assert.equal(r.outcome,"out"); assert.equal(r.luckyBonus,id === "abe" ? 1500 : 1000); assert.equal(r.points,id === "abe" ? 2000 : 1500);
        }
      }
      assert.equal(outs,950); assert.equal(homers,50);
    }
  }
});

test("out-of-park homers apply each pitch multiplier to the 10000 base penalty for either lucky batter",()=>{
  for(const batterId of ["ishihata","abe"]) {
    for(const pitch of NANAIRO_PITCHES) {
      for(const elapsed of [1900,1930]) {
        const initial={...stateFor(batterId,pitch.id),total:777,streak:3};
        const after=playNanairo(initial,{x:50,y:50},elapsed,sequence(.99,.999));
        const r=after.history[0];
        assert.equal(r.outOfPark,true,`${batterId}: ${pitch.id}`);
        assert.equal(r.outcome,"homer");
        assert.equal(r.basePoints,-10000);
        assert.equal(r.points,-10000*pitch.multiplier);
        assert.equal(r.multiplier,pitch.multiplier);
        assert.equal(r.luckyBonus,0);
        assert.equal(r.comboBonus,0);
        assert.equal(r.perfectBonus,0);
        assert.equal(r.streak,0);
        assert.equal(after.total,777-10000*pitch.multiplier);
      }
    }
  }
});

test("lucky guarantee excludes MISS and misthrows; all three out kinds still earn its bonus",()=>{
  for(const id of ["ishihata","abe"]) {
    for(const [roll,outcome] of [[.1,"swing-k"],[.8,"looking-k"],[.95,"out"]]) {
      const r=playNanairo(stateFor(id),{x:50,y:50},1900,sequence(.99,.5,roll)).history[0];
      assert.equal(r.outcome,outcome); assert.equal(r.luckyBonus,id === "abe" ? 1500 : 1000);
    }
    const bad=playNanairo(stateFor(id),{x:50,y:50},1900,sequence(0,0,.999,.99)).history[0];
    assert.equal(bad.misthrow,true); assert.equal(bad.outcome,"walk"); assert.equal(bad.luckyBonus,0);
    const miss=playNanairo(stateFor(id),{x:50,y:50},2000,sequence(.99,0,.99,0,0)).history[0];
    assert.equal(miss.judgement,"MISS"); assert.equal(miss.outcome,"homer"); assert.equal(miss.outOfPark,false);
  }
});

test("updated base abilities apply to actual pitches", () => {
  for (const [id, power, meet] of [["kitazawa",8,8],["chiaki",9,3],["ikehara",6,6],["yamaki",4,3],["kawanabe",3,4],["misawa",5,3],["kan",2,2],["kobayashi",2,2],["ishihata",1,1],["abe",1,1]]) {
    const pitch = result(stateFor(id), sequence(.99));
    assert.equal(pitch.power, power, id);
    assert.equal(pitch.meet, meet, id);
  }
});

test("Kitazawa and Chiaki are strongly weak to PERFECT, with a smaller weakness for Ikehara", () => {
  for (const [id, hitRoll, boost] of [["chiaki",.5,.43],["kitazawa",.8,.43],["ikehara",.68,.23]]) {
    const point = {x:50,y:id === "kitazawa" ? 16 : 50};
    const perfect = playNanairo(stateFor(id),point,1900,sequence(.99,0,.99,hitRoll,0)).history[0];
    const good = playNanairo(stateFor(id),point,1930,sequence(.99,0,.99,hitRoll,0)).history[0];
    assert(Math.abs(perfect.whiffRate-good.whiffRate-boost)<1e-9, id);
    assert.equal(perfect.outcome,"out",id);
    assert.equal(good.outcome,"homer",id);
    const perfectK = playNanairo(stateFor(id),point,1900,sequence(.99,0,id === "chiaki" ? .4 : .2,0,0)).history[0];
    const goodHit = playNanairo(stateFor(id),point,1930,sequence(.99,0,id === "chiaki" ? .4 : .2,0,0)).history[0];
    assert.equal(perfectK.outcome,"swing-k",id);
    assert.equal(goodHit.outcome,"homer",id);
  }
});
