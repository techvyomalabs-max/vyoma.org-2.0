// Task 7T.1A — trivial, side-effect-free entry module used only by
// testEnvDefaults.guard.test.js to prove whether execution past
// testEnvDefaults.mjs's own `--import` preload was allowed to continue.
// Deliberately does nothing else -- in particular, never imports
// src/server.js or attempts any database connection, so a "this should be
// allowed to proceed" test case never actually opens a connection to
// anything, real or disposable.
console.log('placeholder entry reached');
