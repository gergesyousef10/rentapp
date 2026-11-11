# Multi-tenant (org per account) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Firestore document carries an `org`; each signed-in account only reads and writes its own org, enforced by security rules, so the app can be rented to ~5 landlords.

**Architecture:** `org` defaults to the account's lower-cased email; a shared account (the brother) has a `users/{email}` doc pointing at the owner's email. The single-file client filters every listener with `where("org","==",ORG)` and stamps `org` on every write in `put()`. `firestore.rules` is the real boundary.

**Tech Stack:** Vanilla JS single file (`index.html`), Firebase compat SDK 10.12.5 (Auth + Firestore), Firestore security rules v2, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-11-multi-tenant-design.md`

## Global Constraints

- Owner org value is exactly `"gergesyousef10@gmail.com"`; brother email doc id is exactly `magedyousef20@gmail.com` (lower case).
- Collections: `units, tenancies, payments, expenses, sales, salePayments` (the existing `COLS` constant). `users` is never written by the client.
- Execution order is fixed (spec §4): migrate data → brother's `users` doc → deploy client → publish rules → test. Deploying the client before migration makes the cloud look empty and `uploadLocalIfCloudEmpty()` would re-upload stale phone data.
- No new dependencies, no build step, no new screens.

## Review Focus

1. Email with capitals (`Maged...@`): `users/{email}` lookup and rules must both lower-case, or the brother sees an empty app. → Task 3 Step 3 and Task 4 Step 2.
2. Cloud "looks empty" after the `where` filter but `localStorage` still holds old data → `uploadLocalIfCloudEmpty()` re-uploads 60 stale docs. → Task 1 runs first; Task 3 Step 6 verifies counts unchanged after deploy.
3. `restoreXlsx` rows carry no `org` → write rejected by rules. → `put()` stamps `org`, Task 3 Step 3; checked in Task 5 Step 4.
4. A permission error on the `users` read (rules not yet published, or published without the `users` block) must fall back to `org = email`, not hang the login. → Task 3 Step 3.
5. A test account reading another org's doc by id must get `permission-denied`, not data. → Task 5 Step 3.

---

### Task 1: Migrate existing data — stamp `org` on every document

**Files:**
- None in the repo. Run in the built-in browser's page context on `https://gergesyousef10.github.io/rentapp/` while the owner is signed in (same way the orphan payment was inspected earlier).

**Interfaces:**
- Produces: every doc in the six collections has `org === "gergesyousef10@gmail.com"`.

- [x] **Step 1: Count docs missing `org` (expected: all of them)**

```js
(async()=>{const fs=firebase.firestore();const COLS=["units","tenancies","payments","expenses","sales","salePayments"];const r={};for(const c of COLS){const s=await fs.collection(c).get({source:"server"});r[c]={total:s.size,missingOrg:s.docs.filter(d=>!d.data().org).length}}return r})()
```
Expected: `missingOrg === total` for every collection (≈22/21/18/0/0/0).

- [x] **Step 2: Stamp `org` in batches of ≤400**

```js
(async()=>{const fs=firebase.firestore();const ORG="gergesyousef10@gmail.com";const COLS=["units","tenancies","payments","expenses","sales","salePayments"];let n=0,b=fs.batch(),k=0;for(const c of COLS){const s=await fs.collection(c).get({source:"server"});for(const d of s.docs){if(d.data().org===ORG)continue;b.update(d.ref,{org:ORG});n++;if(++k===400){await b.commit();b=fs.batch();k=0}}}if(k)await b.commit();return{updated:n}})()
```
Expected: `updated` ≈ 61.

- [x] **Step 3: Re-run Step 1**

Expected: `missingOrg === 0` everywhere, totals unchanged.

---

### Task 2: Link the brother's account to the owner's org

**Files:**
- None in the repo. Browser page context, owner signed in. (Rules are still the old open ones, so the client may write `users` now; after Task 4 only the Console can.)

**Interfaces:**
- Produces: doc `users/magedyousef20@gmail.com` = `{org:"gergesyousef10@gmail.com"}`.

- [x] **Step 1: Write the doc**

```js
(async()=>{const fs=firebase.firestore();const id="magedyousef20@gmail.com";await fs.collection("users").doc(id).set({org:"gergesyousef10@gmail.com"});return (await fs.collection("users").doc(id).get({source:"server"})).data()})()
```
Expected: `{org:"gergesyousef10@gmail.com"}`.

---

### Task 3: Client — resolve `ORG`, filter listeners, stamp writes

**Files:**
- Modify: `index.html:279` (globals), `index.html:280-284` (`put`), `index.html:325-337` (`onAuthStateChanged` body), `index.html:339-345` (`uploadLocalIfCloudEmpty`)

**Interfaces:**
- Produces: global `let ORG=null` (string after login). `put(col,obj,quiet)` unchanged signature; it sets `obj.org=ORG` when `FB`. `uploadLocalIfCloudEmpty()` sets `org:ORG` on each uploaded object.

- [x] **Step 1: Add the global**

`index.html:279` → `let FB=false,FBUSER=null,FBDENIED=false,ORG=null;`

- [x] **Step 2: Stamp writes in `put()`**

First line inside `put`: `if(FB)obj.org=ORG;` (before the `DB.collection(col).doc(obj.id).set(...)` line). Same stamp in `uploadLocalIfCloudEmpty()`: `b.set(DB.collection(c).doc(o.id),JSON.parse(JSON.stringify({...o,org:ORG})))`.

- [x] **Step 3: Resolve `ORG` after login, then attach filtered listeners**

In `onAuthStateChanged`, after `FBUSER=user.email;DB=fs;` and before the listeners are created, make the listener setup async:

```js
const email=String(user.email||"").toLowerCase();
fs.collection("users").doc(email).get().then(d=>d.exists&&d.data().org||email,()=>email).then(org=>{ORG=org; /* existing listener setup moves in here */ });
```
Each listener becomes `fs.collection(c).where("org","==",ORG).onSnapshot(...)`. The 8-second `timer`, `done()`, `got/srv` bookkeeping stay as they are, inside the `.then`. On sign-out (`if(!user){...}`) add `ORG=null;`.

- [x] **Step 4: Syntax check**

Run (from `~/rentapp`):
```bash
awk '/<script>$/{p=1;next} /<\/script>/{p=0} p' index.html > /tmp/main.js && node --check /tmp/main.js && echo OK
```
Expected: `OK`.

- [x] **Step 5: Commit and push**

```bash
git add index.html
git commit -m "Scope every read and write to the account's org"
git push origin main
```
Then wait until `curl -s https://gergesyousef10.github.io/rentapp/index.html | grep -c 'where("org"'` prints `1` (≈40 s).

- [x] **Step 6: Verify the owner still sees everything**

In the browser: `fetch('./',{cache:'reload'})` then reload; Month tab shows **المفروض 382,300 / اتحصّل 234,500 / 21 tenant cards**; Units tab **22**. No toast "اترفعت البيانات اللي كانت على الموبايل" (that would mean Review Focus #2 fired — stop and investigate).

---

### Task 4: Security rules

**Files:**
- Create: `firestore.rules` (content = spec §3 block, verbatim)

**Interfaces:**
- Consumes: `org` field from Task 1/3, `users/{email}` from Task 2.

- [x] **Step 1: Add `firestore.rules` to the repo and commit**

```bash
git add firestore.rules && git commit -m "Add per-org Firestore rules" && git push origin main
```

- [x] **Step 2: Publish in Firebase Console (owner does this; agent dictates)**

Console → Firestore Database → Rules → replace all → **Publish**. Before publishing, in the Rules Playground: `get /databases/(default)/documents/users/magedyousef20@gmail.com` authenticated as email `Magedyousef20@gmail.com` (capital M) → **Allowed** (proves the `.lower()` in Review Focus #1).

- [x] **Step 3: Owner sanity check**

Reload the app as the owner: same numbers as Task 3 Step 6, no "⛔ الحساب ده مش مسموح له" screen.

---

### Task 5: End-to-end isolation test

**Files:** none.

- [x] **Step 1: Owner creates a throw-away account in Console** (Authentication → Add user, e.g. `test-org@example.com`; owner types the password, agent never sees it) and signs in with it in the browser pane.

- [x] **Step 2: Empty tenant**

Expected: Month tab shows the empty state "مفيش وحدات" and **no** toast about uploading phone data. Add a unit "تجربة" with tenant "ت" rent 1 → it appears. Switch to the owner account → the unit is **not** there.

- [x] **Step 3: Cross-org read is denied** (signed in as the test account)

```js
(async()=>{try{const d=await firebase.firestore().collection("units").doc("u1").get({source:"server"});return{exists:d.exists,data:!!d.data()}}catch(e){return e.code}})()
```
Expected: `"permission-denied"`. (If `u1` does not exist, pick any id from Task 1 Step 1's listing.)

- [x] **Step 4: Backup restore still writes** (owner account)

Download the Excel backup, immediately restore it: toast "اترجعت البيانات ✓", counts unchanged (upsert of identical docs). This proves `restoreXlsx → put()` stamps `org` and passes the rules.

- [x] **Step 5: Brother check**

Brother signs in on his phone → same data as the owner. Then delete the test account in Console (and its "تجربة" docs are harmless orphans in a dead org; delete them from Console if desired).

- [x] **Step 6: Commit the plan with boxes ticked**

```bash
git add docs && git commit -m "Multi-tenant rollout done" && git push origin main
```
