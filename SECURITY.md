# Security Policy

Work Platform targets enterprise intranet deployments, so security issues matter even when the software is not exposed to the public internet.

## Supported Versions

This project is in early development. Security fixes are applied to the `main` branch unless a stable release branch is announced later.

## Reporting a Vulnerability

Please do not open a public GitHub issue for suspected vulnerabilities.

For now, report security concerns through GitHub private vulnerability reporting if it is enabled on the repository, or contact the repository owner `babycoder-dev`.

Include:

- Affected component or path.
- Reproduction steps.
- Expected impact.
- Any relevant logs, request samples, or configuration notes.

Do not include secrets, production credentials, private user data, or full database dumps.

## Security Scope

Important areas include:

- Authentication and session handling.
- Permission and data-scope bypasses.
- Audit log integrity.
- Cross-schema database access violations.
- Secret handling and deployment configuration.
- OpenIM and future integration boundaries.

See `docs/security-baseline.md` for the current security baseline.
