// Run: node --test tests/tafqeet.test.mjs
// The amount in words printed on every receipt.
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const src=html.match(/function tafqeet\(n\)\{[\s\S]*?\n\}\n/)[0];
const tafqeet=new Function(src+"return tafqeet;")();

test("amounts in words",()=>{
  const cases=[
    [0,"صفر"],[5,"خمسة"],[15,"خمسة عشر"],[21,"واحد وعشرون"],[200,"مائتان"],
    [1000,"ألف"],[2000,"ألفان"],[3000,"ثلاثة آلاف"],[11000,"أحد عشر ألف"],
    [200000,"مائتا ألف"],[250000,"مائتان وخمسون ألف"],[300000,"ثلاثمائة ألف"],
    [1200000,"مليون ومائتا ألف"],[2500000,"مليونان وخمسمائة ألف"],
    [4950,"أربعة آلاف وتسعمائة وخمسون"],
  ];
  for(const [n,w] of cases)assert.equal(tafqeet(n),w,String(n));
});
