# Distribution and privacy limits

This public repository was assembled from a named allowlist. It contains **no** `.env`, saved Google session, private customer photos, private supplier bids, Render admin key, or local job records. Run your own security review before installing third-party source code.

- AI server only on localhost 127.0.0.1; never expose it to the internet without authentication.
- Each operator uses their own OS account, keys, local access token, and Google OAuth consent.
- No connection to hosted private portal admin API unless separately authorized with scoped per-user credentials (not yet implemented).
- Customer records stay in local browser and private directories until exported or explicitly shared. Backups are sensitive.
- MCP write switch stays disabled until operator authorizes creating unpriced drafts. Model output is never an approved price or contract.
- This is source code, not a signed Windows installer. Do not bypass SmartScreen or antivirus globally.
- Before general commercial release: full independent security assessment, signing, encryption-at-rest, cloud authorization, shared tenancy, audit and retention.
