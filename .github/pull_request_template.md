## Summary

- 

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:e2e`
- [ ] `pnpm build`
- [ ] Docker build or deployment impact checked

## Review Focus

- [ ] Module boundaries are respected
- [ ] API contracts are updated
- [ ] Tests cover changed behavior
- [ ] Internal network deployment impact is considered
- [ ] Security and permission impact is considered
- [ ] Open-source license impact is considered

## Architecture Checklist

- [ ] Change maps to a documented milestone or updates `docs/foundation-progress.md`
- [ ] API version compatibility is preserved or explicitly documented
- [ ] Permission, menu, audit, and data-scope impact is considered
- [ ] Domain events or notification intent are declared when cross-module behavior is needed
- [ ] Database migration and seed impact is considered
- [ ] TLS, secret management, backup/restore, and connection pool impact is considered
- [ ] Business code does not call OpenIM or another module's internals directly
