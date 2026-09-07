# Release and Submission Checklist

Use this checklist before publishing the repository, recording the demo, or
submitting the hackathon entry.

## Source and dependency gate

- [ ] `npm install` succeeds from a clean checkout.
- [ ] `(cd web && npm install)` succeeds.
- [ ] `npm run build` succeeds.
- [ ] `npm test` passes with no failing suites.
- [ ] `(cd web && npm run lint)` succeeds.
- [ ] `(cd web && npm run build)` succeeds.
- [ ] `npm audit --audit-level=high --omit=dev` reports no high-severity issues.
- [ ] `(cd web && npm audit --audit-level=high --omit=dev)` reports no high-severity issues.
- [ ] `npm pack --dry-run --json` contains the intended source, compiled
      output, docs, examples, and tests, but no `data/`, secrets, or build
      cache.

## Functional gate

- [ ] `npm start -- demo --offline` completes successfully.
- [ ] Repeating the offline proposal does not create duplicate pending IDs.
- [ ] `npm run backtest -- --data examples/backtest-klines.json` completes.
- [ ] The dashboard starts on `http://localhost:3000`.
- [ ] Existing pending actions load without a notification storm.
- [ ] A new batch creates one aggregated notification.
- [ ] Action IDs are visible and copyable.
- [ ] Deep Dive shows rationale, confidence, size, risk notes, and raw fields.
- [ ] Paired opportunities show both legs before confirmation.
- [ ] Confirm displays an execution instruction and a copyable Next Codex / agent
      command containing the exact Action ID.
- [ ] The generated continuation command says not to run `aether confirm` again
      and requires read-only preflight plus final write authorization.
- [ ] Reject changes only the selected action.
- [ ] Reject all requires explicit confirmation.
- [ ] Malformed API requests return validation errors, not stack traces.
- [ ] Unknown Action IDs return a clear not-found response.
- [ ] Profile changes affect future scans and do not silently alter existing
      actions.
- [ ] Public/offline/non-MCP-scenario proposals visibly show `DEMO / PAPER` and their
      confirm controls are blocked.
- [ ] A funded MCP portfolio proposal visibly shows `MCP LIVE ACCOUNT` and
      `MCP LIVE`; a zero/dust MCP portfolio shows `MCP DATA / PAPER`.
- [ ] Real prediction-market, on-chain, and x402 actions visibly show
      `LIVE AGENT OS WALLET / SKILLS`.
- [ ] Switching either execution context or mode expires incompatible pending
      approvals.
- [ ] The dashboard requires explicit confirmation before switching from an
      active MCP context to the public `DEMO / PAPER` scan.
- [ ] A demo/paper/legacy action cannot produce an execution instruction even
      if its JSON status is manually changed.

## Documentation gate

- [ ] The root README explains purpose, setup, limitations, and safety.
- [ ] `AGENT.md` is present and matches the actual MCP/Skills workflow.
- [ ] `docs/GETTING_STARTED.md` works for a new operator.
- [ ] `docs/HACKATHON_SUBMISSION.md` has all external URLs filled in.
- [ ] The pitch and demo scripts match the current UI.
- [ ] Risk profiles, architecture, testing, security, and operations docs are
      current.
- [ ] No credentials, private balances, account IDs, or personal data appear
      in the repository or recording.
- [ ] `SECURITY.md` is visible from the repository root.

## Recording gate

- [ ] Use the offline demo unless live MCP data is necessary and redacted.
- [ ] Do not show private account data or secrets.
- [ ] Show one standard opportunity and one paired-leg opportunity.
- [ ] Show risk sizing and at least one rejected or guarded path.
- [ ] Show the Action ID and confirmation-instruction boundary.
- [ ] Say explicitly that the engine does not call trading-write tools.
- [ ] Mention paper mode and backtest limitations.
- [ ] Explain the difference between `MCP LIVE ACCOUNT`, `MCP DATA / PAPER`,
      and `DEMO / PAPER` in the recording.
- [ ] Keep the final video within the chosen submission length.

## External submission gate

- [ ] Follow the event's official social instructions.
- [ ] Repost/quote-repost the official announcement if required.
- [ ] Reply with the project, GitHub, and demo/video links.
- [ ] Complete the official survey.
- [ ] Verify the final deadline and eligibility restrictions on the official
      announcement immediately before submitting.
