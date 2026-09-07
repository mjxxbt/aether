# Aether Dashboard

The dashboard is the local Next.js control surface for Aether. Run it from
the repository root:

```bash
npm run dashboard
```

Then open http://localhost:3000. It reads the engine’s local memory and
pending-action files, provides market scans, trade logging, and explicit
Confirm/Reject controls. It never places exchange orders itself; the
orchestrating agent reads the confirmed execution instruction and calls the
appropriate Binance MCP or Agentic Wallet tool.

For a production verification build:

```bash
cd web
npm ci
npm run lint
npm run build
npm start
```

See the repository [Getting Started guide](../docs/GETTING_STARTED.md) for
the complete MCP setup and safety workflow. The route contract is documented
in [docs/API.md](../docs/API.md), and the security boundary is documented in
[docs/SECURITY_AND_SAFETY.md](../docs/SECURITY_AND_SAFETY.md).
