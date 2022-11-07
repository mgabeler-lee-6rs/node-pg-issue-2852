// make sure you set PGHOST, etc.

const assert = require("assert");
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({});
  let errorCount = 0;
  const errorLogger = (err) => {
    ++errorCount;
    console.error("Got an error", { err: err.message });
  };
  pool.on("error", errorLogger);
  // this is a nice way to not have to repeat the per-acquire error logging
  // logic, but there's no clean way to remove this error listener on each
  // release.
  pool.on("acquire", (client) => {
    client.removeListener("error", errorLogger);
    client.on("error", errorLogger);
  });

  await mockWork(pool, false);
  assert.equal(errorCount, 0);
  await mockWork(pool, true);
	// we get two ambient errors most of the time here: 'terminating connection
	// due to idle-in-transaction timeout' and 'Connection terminated
	// unexpectedly'
  assert.equal(errorCount, 2);
  errorCount = 0;
  await mockWork(pool, true);
  assert.equal(errorCount, 2);
}

async function mockWork(pool, timeout) {
  const client = await pool.connect();
  // timeout connection after 5 seconds idle in transaction
  await client.query("SET SESSION idle_in_transaction_session_timeout = 1000");

  console.log("Starting transaction");
  await client.query("BEGIN");
  let doRollback = true;
  try {
    console.log("Mocking some work");
    // mock some work
    await client.query("SELECT 1");
    console.log("Mocking a delay");
    const delay = timeout ? 1500 : 500;
    // mock making some other network call that takes "too long"
    await new Promise((r) => setTimeout(r, delay));
    doRollback = false;
    // mock more work
    console.log("Mocking more work");
    await client.query("SELECT 1");
    console.log("Committing transaction");
    await client.query("COMMIT");
  } catch (err) {
    console.error("Transaction failed", { err });
  } finally {
    if (doRollback) {
      console.log("Rolling back after error");
      await client.query("ROLLBACK");
    }
    console.log("Releasing client");
    client.release();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Uncaught error from main", { err });
    process.exit(1);
  });
}
