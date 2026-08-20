/* Road-space regression checks.
 *
 * The floor renderer used to choose one corridor from the CAMERA and transpose every sample when
 * a turn crossed a heading threshold. These checks pin the two invariants that mechanism broke:
 * a world road sample cannot change when only the camera yaw changes, and coarse road mass must
 * still exist beyond the detail cutoff so fog, rather than a black slab, owns visibility. */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
global.CC = require(path.join(ROOT, 'src/core.js'));
for (const rel of ['src/weather_state.js', 'src/city.js', 'src/surfaces.js', 'src/raycast.js'])
  require(path.join(ROOT, rel));

const CC = global.CC;
const seed = 17;
const city = CC.City.make(seed);
if (CC.Weather) CC.Weather.init(city, CC.mulberry(seed ^ 0x5bf03635));

const cols = 240, rows = 80;
const frame = CC.makeFrame(cols, rows);
const ax = city.aveX(0) + 0.5;
const cz = city.crossZ(0) + 0.5;
const cam = {
  x: ax, z: cz, yaw: 0, eyeY: 1.7, fov: 1.25,
  horizon: rows * 0.56, scale: rows * 0.9, t: 0
};

function render(yaw) {
  cam.yaw = yaw;
  CC.clearFrame(frame);
  CC.Cast.render(frame, cam, city);
}

/* ROUT is reused by floorTex, so every field needed by the comparison is copied immediately. */
function worldSnapshot() {
  const a = [];
  let x, z, o;
  for (x = ax - 54; x <= ax + 54; x += 1.25) {
    for (z = cz - 1; z <= cz + 1; z += 1) {
      o = CC.Surf.floorTex(x, z, 34, 0);
      a.push(o.ch, o.col, o.lum, Math.round(o.mir * 10000), Math.round(o.rip * 10000), o.wch);
    }
  }
  for (z = cz - 54; z <= cz + 54; z += 1.25) {
    for (x = ax - 1; x <= ax + 1; x += 1) {
      o = CC.Surf.floorTex(x, z, 34, 0);
      a.push(o.ch, o.col, o.lum, Math.round(o.mir * 10000), Math.round(o.rip * 10000), o.wch);
    }
  }
  return a;
}

render(0);
const north = worldSnapshot();
render(Math.PI * 0.5);
const east = worldSnapshot();
if (north.length !== east.length) throw new Error('road regression: snapshot size changed');
for (let i = 0; i < north.length; i++) {
  if (north[i] !== east[i])
    throw new Error('road regression: world floor changed with camera yaw at value ' + i +
                    ' (' + north[i] + ' != ' + east[i] + ')');
}

/* Avoid centre, edge and stop lines by sampling a dense patch of carriageway. A stochastic coarse
 * surface is allowed to leave individual cells black, but not the whole patch. Before the fix the
 * fl===0 branch returned black for every one of these base cells at 60 m. */
let painted = 0, total = 0;
for (let along = 9; along <= 23; along += 0.55) {
  for (let lateral = -0.9; lateral <= 0.9; lateral += 0.45) {
    const o = CC.Surf.floorTex(ax + along, cz + lateral, 60, 0);
    painted += o.ch !== 0 && o.lum > 0 ? 1 : 0;
    total++;
  }
}
if (painted < total * 0.12)
  throw new Error('road regression: far cross street lost its surface mass (' + painted + '/' +
                  total + ' painted)');

const cf = CC.Surf.cfg;
if (cf.an === cf.ac.length || cf.cn === cf.cc.length)
  throw new Error('road regression: visible street arrays reached capacity (' + cf.an + ', ' +
                  cf.cn + ')');

console.log('road regression: world samples stable across yaw; far road ' + painted + '/' + total +
            ' painted; arrays ' + cf.an + ' avenues, ' + cf.cn + ' cross streets');
