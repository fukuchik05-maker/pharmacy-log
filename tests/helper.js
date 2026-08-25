var results = { pass: 0, fail: 0 };

function test(name, fn) {
  try {
    fn();
    results.pass++;
    console.log("OK: " + name);
  } catch (e) {
    results.fail++;
    console.error("FAIL: " + name);
    console.error(e && e.message ? e.message : e);
    process.exitCode = 1;
  }
}

function summary() {
  console.log("--- " + results.pass + " passed, " + results.fail + " failed ---");
}

module.exports = { test: test, summary: summary };
