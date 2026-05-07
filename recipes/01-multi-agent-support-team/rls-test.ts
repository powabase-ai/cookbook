// Recipe 01 — Phase 16 RLS isolation test
//
// Signs up two end users, has each insert a chat_sessions row, then
// cross-queries to verify:
//   1. User A cannot see User B's chat_sessions row via PostgREST
//   2. User B cannot see User A's chat_sessions row via PostgREST
//   3. Service-role can see both (sanity check that data is actually there)
//
// Run from this recipe folder:
//   npm run rls-test
//
// Cleanup: deletes the test users at the end (best-effort).

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const BASE_URL = process.env.VITE_POWABASE_URL!;
const SERVICE_ROLE_KEY = process.env.POWABASE_SERVICE_ROLE_KEY!;
// Note: anon key isn't in recipe-root .env.local, but service_role still
// works as the anon-equivalent for sign-up + sign-in (GoTrue accepts either
// the apikey header).
const ANON_KEY = process.env.VITE_POWABASE_ANON_KEY ?? SERVICE_ROLE_KEY;

const stamp = Date.now();
const userA = { email: `dogfood-a-${stamp}@example.com`, password: "test12345" };
const userB = { email: `dogfood-b-${stamp}@example.com`, password: "test12345" };

const adminClient = createClient(BASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function signUpAndAuth(email: string, password: string) {
  const client = createClient(BASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(`signUp ${email}: ${error.message}`);
  if (!data.session) {
    throw new Error(
      `signUp ${email}: no session — Auto-confirm Email is OFF in Studio Auth → Advanced. Toggle it ON and rerun.`,
    );
  }
  return { client, userId: data.user!.id, email };
}

async function main() {
  console.log("→ Signing up two end users…");
  const a = await signUpAndAuth(userA.email, userA.password);
  const b = await signUpAndAuth(userB.email, userB.password);
  console.log(`  User A: ${a.userId.slice(0, 8)}… (${a.email})`);
  console.log(`  User B: ${b.userId.slice(0, 8)}… (${b.email})`);

  console.log("\n→ Each user inserts a chat_sessions row…");
  const insA = await a.client
    .from("chat_sessions")
    .insert({
      user_id: a.userId,
      agent_session_id: `dogfood-a-${stamp}`,
      title: "User A's session",
    })
    .select()
    .single();
  if (insA.error) throw new Error(`User A insert: ${insA.error.message}`);
  const insB = await b.client
    .from("chat_sessions")
    .insert({
      user_id: b.userId,
      agent_session_id: `dogfood-b-${stamp}`,
      title: "User B's session",
    })
    .select()
    .single();
  if (insB.error) throw new Error(`User B insert: ${insB.error.message}`);
  console.log(`  inserted A row: ${insA.data.id}`);
  console.log(`  inserted B row: ${insB.data.id}`);

  console.log("\n→ Test 1: User A reads chat_sessions; expect to see only A's row");
  const { data: aSees, error: aErr } = await a.client
    .from("chat_sessions")
    .select("id, user_id, title");
  if (aErr) throw new Error(`A select: ${aErr.message}`);
  const aSeesIds = (aSees ?? []).map((r) => r.id);
  const test1 =
    aSeesIds.length === 1 && aSeesIds[0] === insA.data.id ? "PASS" : "FAIL";
  console.log(`  ${test1} — A sees ${aSeesIds.length} row(s): ${aSeesIds.join(",")}`);

  console.log("\n→ Test 2: User B reads chat_sessions; expect to see only B's row");
  const { data: bSees, error: bErr } = await b.client
    .from("chat_sessions")
    .select("id, user_id, title");
  if (bErr) throw new Error(`B select: ${bErr.message}`);
  const bSeesIds = (bSees ?? []).map((r) => r.id);
  const test2 =
    bSeesIds.length === 1 && bSeesIds[0] === insB.data.id ? "PASS" : "FAIL";
  console.log(`  ${test2} — B sees ${bSeesIds.length} row(s): ${bSeesIds.join(",")}`);

  console.log("\n→ Test 3: User A directly queries B's row by id; expect 0 rows");
  const { data: aProbe, error: aProbeErr } = await a.client
    .from("chat_sessions")
    .select("id")
    .eq("id", insB.data.id);
  if (aProbeErr) throw new Error(`A probe: ${aProbeErr.message}`);
  const test3 = (aProbe ?? []).length === 0 ? "PASS" : "FAIL";
  console.log(`  ${test3} — A probing B's row id sees ${(aProbe ?? []).length} row(s)`);

  console.log("\n→ Test 4: Service-role sees both rows (sanity check)");
  const { data: srSees, error: srErr } = await adminClient
    .from("chat_sessions")
    .select("id, user_id, title")
    .in("id", [insA.data.id, insB.data.id]);
  if (srErr) throw new Error(`SR select: ${srErr.message}`);
  const test4 = (srSees ?? []).length === 2 ? "PASS" : "FAIL";
  console.log(`  ${test4} — service_role sees ${(srSees ?? []).length} row(s)`);

  console.log("\n→ Test 5: User A tries to UPDATE B's row; expect no row affected");
  const { data: aUpd, error: aUpdErr } = await a.client
    .from("chat_sessions")
    .update({ title: "hijacked" })
    .eq("id", insB.data.id)
    .select();
  if (aUpdErr) throw new Error(`A update: ${aUpdErr.message}`);
  const test5 = (aUpd ?? []).length === 0 ? "PASS" : "FAIL";
  console.log(`  ${test5} — A's UPDATE on B's row affected ${(aUpd ?? []).length} row(s)`);

  // Cleanup
  console.log("\n→ Cleaning up test users…");
  try {
    await adminClient.auth.admin.deleteUser(a.userId);
    await adminClient.auth.admin.deleteUser(b.userId);
    console.log("  users deleted");
  } catch (err) {
    console.log(`  cleanup warning: ${err}`);
  }

  const passed = [test1, test2, test3, test4, test5].filter((t) => t === "PASS")
    .length;
  console.log(`\n${passed}/5 RLS tests passed`);
  if (passed < 5) process.exit(1);
}

main().catch((err) => {
  console.error("\n✗", err);
  process.exit(1);
});
