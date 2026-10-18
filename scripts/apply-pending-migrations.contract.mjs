import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { assertMigrationTarget, migrationHistoryConflicts, planPending, stripTransactionControl, nonTransactionalStatements, planRecord, runRecord, RECORD_ALLOW_LIST } from "./apply-pending-migrations.mjs";

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

// MODE=record: history rows only, explicit allow-list, probe-gated, all-or-nothing.
{
  const repoFiles = readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql")).map((n) => n.slice(0, -4));
  const allowed = Object.keys(RECORD_ALLOW_LIST);
  assert.equal(allowed.length, 20, "17 reflected + 3 neutralised versions");
  for (const v of allowed) {
    assert.ok(repoFiles.includes(`${v}_${RECORD_ALLOW_LIST[v].name}`), `${v}: allow-list name matches a repo file`);
    assert.ok(/^select \(/.test(RECORD_ALLOW_LIST[v].probe), `${v}: probe is a single SELECT`);
    assert.ok(
      !/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(RECORD_ALLOW_LIST[v].probe.replace(/'[^']*'/g, "")),
      `${v}: probe is read-only`,
    );
  }
  assert.ok(!allowed.includes("20261018090400"), "the real security migration is never recorded without being applied");

  const makeDb = (probeResult) => {
    const calls = { probes: [], recorded: [] };
    return {
      calls,
      db: {
        probe: async (text) => {
          calls.probes.push(text);
          return typeof probeResult === "function" ? probeResult(text) : probeResult;
        },
        record: async (rows) => {
          calls.recorded.push(...rows);
        },
      },
    };
  };

  // A version not on the allow-list refuses the whole run before any probe.
  const refused = makeDb(true);
  await assert.rejects(
    runRecord({ requested: ["20261016120000", "20260913160343"], repoNames: repoFiles, live: [], db: refused.db }),
    /not on the record allow-list/,
  );
  assert.equal(refused.calls.probes.length, 0, "refusal happens before probing");
  assert.equal(refused.calls.recorded.length, 0, "refusal writes nothing");
  assert.equal(planRecord(["20261018090400"], repoFiles, []).refusals.length, 1);
  assert.equal(planRecord([], repoFiles, []).refusals.length, 1, "an empty request is refused");

  // One failing probe aborts everything, even versions whose probes passed.
  const failing = makeDb((text) => text !== RECORD_ALLOW_LIST["20261017100000"].probe);
  await assert.rejects(
    runRecord({ requested: ["20261016120000", "20261017100000"], repoNames: repoFiles, live: [], db: failing.db }),
    /20261017100000: probe did not find/,
  );
  assert.equal(failing.calls.recorded.length, 0, "probe failure writes nothing");
  const erroring = makeDb(() => {
    throw new Error("relation does not exist");
  });
  await assert.rejects(
    runRecord({ requested: ["20261016120000"], repoNames: repoFiles, live: [], db: erroring.db }),
    /probe errored/,
  );
  assert.equal(erroring.calls.recorded.length, 0);

  // Success: only probes run, then (version, name) rows; already-recorded skipped.
  const ok = makeDb(true);
  const result = await runRecord({
    requested: ["all"],
    repoNames: repoFiles,
    live: [{ version: "20261016120000", name: "trial_publishing" }],
    db: ok.db,
  });
  assert.equal(result.recorded.length, 19);
  assert.deepEqual(result.skipped, ["20261016120000"]);
  assert.deepEqual(ok.calls.recorded[0], { version: "20260919000000", label: "workspace_provisioning_and_outcome_rls_hardening" });
  const bodies = repoFiles.map((n) => readFileSync(`supabase/migrations/${n}.sql`, "utf8").trim()).filter(Boolean);
  for (const text of ok.calls.probes) {
    assert.ok(/^select \(/.test(text), "record mode only issues probe SELECTs");
    assert.ok(!bodies.some((body) => text.includes(body)), "no migration SQL file is executed in record mode");
  }
  const src = readFileSync("scripts/apply-pending-migrations.mjs", "utf8");
  const recordFn = src.slice(src.indexOf("export async function runRecord"), src.indexOf("async function main"));
  assert.ok(!/readFileSync|unsafe\(/.test(recordFn), "runRecord never reads or executes migration files");
  assert.ok(/CONFIRM_RECORD !== "RECORD"/.test(src), "record mode requires explicit confirmation");
}
console.log("apply-pending-migrations contract: OK");
