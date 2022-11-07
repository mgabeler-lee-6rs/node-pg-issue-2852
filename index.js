// make sure you set PGHOST, etc.

const { Pool } = require("pg");

async function main() {
  const pool = new Pool({});
  pool.on("error", (err, client) => {
    console.error("Got an error", { err });
  });

  const client = await pool.connect();
  // timeout connection after 5 seconds idle in transaction
  await client.query("SET SESSION idle_in_transaction_session_timeout = 5000");

  console.log("Starting transaction");
  // mock: a transaction that might pause too long and wants to catch the idle error
  await client.query("BEGIN");
  let doRollback = true;
  try {
    console.log("Mocking some work");
    // mock some work
    await client.query("SELECT 1");
    console.log("Mocking a delay");
    // mock making some other network call that takes "too long"
    await new Promise((r) => setTimeout(r, 6000));
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
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Uncaught error from main", { err });
    process.exit(1);
  });
}
