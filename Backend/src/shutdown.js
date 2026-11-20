// A bounded, dependency-injectable graceful-shutdown sequence (Phase 1 Task
// 4C). Extracted from server.js so it's directly unit-testable without real
// OS signals (SIGTERM delivery on Windows is documented by Node itself as
// unreliable -- see this module's test file for why that matters here) and
// without spinning up a real server/database per test.
//
// Order: stop accepting new HTTP connections -> close idle keep-alive
// connections -> wait for in-flight requests to finish naturally (bounded by
// `timeoutMs`, which covers the ENTIRE sequence including the MongoDB
// disconnect below, not just the HTTP drain) -> disconnect MongoDB -> exit
// exactly once. Never retries or reconnects anything itself -- the MongoDB
// driver already owns reconnection -- this only sequences an orderly stop of
// work that was already going to happen.
export function createGracefulShutdown({ server, disconnectDb, exit = process.exit, log = console, timeoutMs = 10000 }) {
  let shuttingDown = false;

  return async function shutdown(signal) {
    if (shuttingDown) {
      log.warn(`[shutdown] ${signal} received while a shutdown is already in progress -- ignoring.`);
      return;
    }
    shuttingDown = true;
    log.log(`[shutdown] ${signal} received -- starting graceful shutdown.`);

    let timedOut = false;
    let timer;
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        log.warn(`[shutdown] did not complete within ${timeoutMs}ms -- forcing exit.`);
        resolve();
      }, timeoutMs);
      // Deliberately NOT unref'd: this timer is the only thing standing
      // between a hung shutdown and a controlled, logged, non-zero-code
      // exit -- unref'ing it would let Node's event loop consider itself
      // "done" and spin down before the timer ever fires whenever nothing
      // else is pending (confirmed while building this module's own tests:
      // a mock server with no other open handle hung indefinitely with an
      // unref'd timer here). It is always cleared immediately once the race
      // below settles, so it never outlives a single shutdown() call.
    });

    // Every step below catches its own failure and continues to the next
    // one -- a failure in either step must never leave `work` unsettled
    // (which would otherwise race the timeout forever) or reject (which
    // would surface as an unhandled rejection once nothing is awaiting it
    // anymore, e.g. after the timeout already won the race below). A caught
    // failure here still marks the shutdown as unclean via `hadError`, so a
    // handled-but-real problem (e.g. MongoDB refusing to disconnect) is
    // never silently reported as a successful (exit code 0) shutdown.
    let hadError = false;
    const work = (async () => {
      try {
        await closeServer(server);
      } catch (err) {
        hadError = true;
        log.error(`[shutdown] error while closing the HTTP server (${safeErrorName(err)}) -- continuing shutdown anyway.`);
      }

      try {
        await disconnectDb();
      } catch (err) {
        hadError = true;
        log.error(`[shutdown] error while disconnecting MongoDB (${safeErrorName(err)}) -- continuing shutdown anyway.`);
      }
    })();
    // Belt-and-braces: `work` above already catches everything it awaits, so
    // it should never reject -- this just guarantees that even a future
    // change that introduces an unguarded throw can never surface as an
    // unhandled rejection once the race below has already moved on.
    work.catch(() => {});

    await Promise.race([work, timeoutPromise]);
    clearTimeout(timer);

    // Forced exit is reserved for an ABNORMAL outcome (the bounded timeout,
    // or a step that failed even though it was caught) -- by this point
    // `work` has either fully completed (good) or we're bailing out because
    // it didn't (bad), so forcing exit(1) here is never interrupting any
    // pending cleanup/logging: there is none left to interrupt either way.
    // The guard above already prevents a second concurrent shutdown() call
    // from ever reaching this line twice, so this is called at most once.
    if (timedOut || hadError) {
      exit(1);
      return;
    }

    // A clean run (HTTP server closed, MongoDB disconnected, no errors)
    // deliberately does NOT call exit() -- it prefers letting Node terminate
    // naturally once nothing is left keeping the event loop alive, per this
    // project's own "forced termination only when necessary" design intent.
    // Verified safe for this codebase specifically: there is no setInterval
    // anywhere in Backend/src, and express-rate-limit's own internal cleanup
    // interval already calls .unref() itself -- so there is no known open
    // handle left once the HTTP server and MongoDB connection are both
    // closed. (A future dependency that adds its own un-unref'd timer could
    // in principle prevent natural exit; the bounded-timeout path above is
    // deliberately NOT a substitute safety net for that case, since it only
    // re-triggers if shutdown() itself is called again -- this is a known,
    // accepted tradeoff of preferring natural termination here.)
    log.log('[shutdown] graceful shutdown complete -- terminating naturally.');
  };
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
    // Closes keep-alive sockets that are NOT currently processing a
    // request; a socket mid-request is left alone so the server.close()
    // callback above can keep waiting for it to finish naturally. Without
    // this, an idle keep-alive client could hold the shutdown open
    // indefinitely (server.close() alone only refuses NEW connections --
    // it does not proactively close existing idle ones).
    server.closeIdleConnections?.();
  });
}

function safeErrorName(err) {
  try {
    if (err && typeof err.name === 'string' && err.name) return err.name;
  } catch {
    // Mirrors db.js's own error-listener hardening: a hostile/malformed
    // error-like value must never crash this logging path.
  }
  return 'Unknown';
}
