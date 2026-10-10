import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { assertMigrationTarget, migrationHistoryConflicts, planPending, stripTransactionControl, nonTransactionalStatements } from "./apply-pending-migrations.mjs";

const repo = ["20260101000000_a", "20260102000000_b", "20260103000000_c", "README"];
const plan = planPending(repo, [{ version: "20260101000000", name: "a" }, { version: "20260103000000", name: "c" }]);
assert.deepEqual(plan.map((p) => p.name), ["20260102000000_b"], "only versions missing from live history are pending");
assert.equal(plan[0].version, "20260102000000");
assert.equal(plan[0].label, "b");
assert.deepEqual(planPending(repo, repo.slice(0, 3).map((n) => ({ version: n.slice(0, 14) }))), [], "in sync -> nothing pending");
assert.deepEqual(migrationHistoryConflicts(repo, [{ version: "20260101000000", name: "a" }]), []);
assert.ok(migrationHistoryConflicts(repo, [{ version: "20251231000000", name: "b" }]).some(message => message.includes("another version")));
assert.ok(migrationHistoryConflicts(repo, [{ version: "20260101000000", name: "different" }]).some(message => message.includes("different local and remote")));
assert.ok(migrationHistoryConflicts(repo, [{ version: "20251231000000", name: "remote_only" }]).length > 0);
const ref = "abcdefghijklmnopqrst";
assert.equal(assertMigrationTarget(`postgresql://postgres:example@db.${ref}.supabase.co/postgres`, ref), ref);
assert.equal(assertMigrationTarget(`postgres://postgres.${ref}:example@aws-0-us-west-2.pooler.supabase.com/postgres`, ref), ref);
assert.throws(() => assertMigrationTarget("postgres://postgres:example@localhost/postgres", ref), /does not match/);
assert.throws(() => assertMigrationTarget(`postgres://postgres:example@db.${ref}.supabase.co/postgres`, "tsrqponmlkjihgfedcba"), /does not match/);
assert.throws(() => assertMigrationTarget("not a url", ref), /invalid/);

const stripped = stripTransactionControl("BEGIN;\ncreate table t(id int);\nCOMMIT;\n");
assert.ok(!/^\s*(BEGIN|COMMIT)\s*;/im.test(stripped), "BEGIN/COMMIT removed");
assert.ok(/create table t/.test(stripped), "body kept");
assert.ok(/\$\$\s*BEGIN\s*\n/.test(stripTransactionControl("as $$ BEGIN\n  return 1;\nEND; $$")) , "plpgsql BEGIN inside body untouched");
const fn = "create function f() returns int language plpgsql as $$\nBEGIN\n  return 1;\nEND;\n$$;";
assert.equal(stripTransactionControl(fn), fn, "plpgsql BEGIN/END; lines inside function bodies are kept");
const tagged = "BEGIN;\ncreate function g() returns void language plpgsql as $fn$\nBEGIN;\nEND;\n$fn$;\nCOMMIT;";
assert.equal(stripTransactionControl(tagged), "create function g() returns void language plpgsql as $fn$\nBEGIN;\nEND;\n$fn$;", "only top-level transaction lines are stripped (tagged dollar quotes)");
assert.ok(nonTransactionalStatements("create index concurrently x on t(a);"));
assert.ok(!nonTransactionalStatements("create index x on t(a);"));

// Every repo migration must be runnable by the transactional runner.
for (const f of readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql"))) {
  const body = stripTransactionControl(readFileSync(`supabase/migrations/${f}`, "utf8"));
  assert.ok(!/^\s*(BEGIN|COMMIT)\s*;\s*$/im.test(body), `${f}: top-level transaction control left after strip`);
}

const wf = readFileSync(".github/workflows/apply-pending-migrations.yml", "utf8");
assert.ok(/workflow_dispatch/.test(wf) && !/\n\s*(push|pull_request|schedule):/.test(wf), "manual trigger only");
assert.ok(/default: plan/.test(wf), "read-only plan is the default mode");
assert.ok(/confirm != 'APPLY'/.test(wf), "apply requires explicit confirmation");
assert.ok(/EXPECTED_SUPABASE_PROJECT_REF/.test(wf), "workflow passes the confirmed target");
console.log("apply-pending-migrations contract: OK");
