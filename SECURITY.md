# Security Policy

## Supported version

The current hackathon branch is the supported version:

| Version | Supported                   |
| ------- | --------------------------- |
| `0.2.x` | Yes, for the hackathon demo |

## Reporting a vulnerability

Please do not open a public issue containing credentials, private account
data, exploit code, or a live Binance action ID. Report security issues to
the repository owner through the private contact configured for the GitHub
repository, or use GitHub's private vulnerability reporting if enabled.

Include:

- affected commit or version;
- reproduction steps that do not use real funds;
- expected and observed behavior;
- potential impact;
- a safe contact method for follow-up.

If a live Agent OS account may be affected, immediately stop the orchestrating
agent and revoke the relevant Binance permissions before investigating.

## Important deployment warning

The local Next.js dashboard has no built-in authentication. Keep it bound to
localhost or place it behind an authenticated private network. Do not expose
port 3000 directly to the public internet.

See [docs/SECURITY_AND_SAFETY.md](docs/SECURITY_AND_SAFETY.md) for the threat
model, emergency stop procedure, data handling, and confirmation boundary.
