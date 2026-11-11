// Run: node --test tests/
// Pulls the pure helpers (isInc/amt/exSplit) out of index.html and checks that "دخل" counts as income.
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const src=html.match(/const isInc=.*\nconst exSplit=.*\n/)[0];
const {exSplit}=new Function(src+"return {exSplit};")();

test("income entries add to inc, everything else to ex",()=>{
  const r=exSplit([{cat:"كهرباء",amount:300},{cat:"دخل",amount:5000},{cat:"أخرى",amount:"200"}]);
  assert.deepEqual(r,{ex:500,inc:5000});
});
test("empty month gives zeros",()=>{assert.deepEqual(exSplit([]),{ex:0,inc:0})});
