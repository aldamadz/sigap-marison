# Changelog

## [2026-08-04] fix: tighten transitive dependency security overrides

### Added
- `resolutions.fast-uri` block with `fast-uri: 3.1.5` and `$fast-uri: 4.1.2`. This handles both major-version lines so consumers requiring `^3.0.0` and `^4.0.0` get the corresponding fixed version.
- Tighter `glob` override (`^11.1.0`) covering the GHSA-5j98-mcp5-4vw2 command-injection fix released in 11.1.0.
- Tighter `brace-expansion` override (`5.0.9`) covering the CVE-2026-14257 mitigation bypass fixed in 5.0.9.

### Changed
- `package.json` overrides tightened from `glob: 11.0.0`, `brace-expansion: ^5.0.0` to `glob: ^13.0.0`, `brace-expansion: 5.0.9`.
- `package.json` devDependencies pinned `@types/node` to `22.16.5` and `typescript` to `5.8.3` to match staging baseline and avoid TS 5.9 Buffer type regression with exceljs types.
- `package-lock.json` regenerated to match the override resolution.

### Fixed
- `brace-expansion 4.0.0 - 5.0.8` (CVE-2026-14257 mitigation bypass) — overridden to 5.0.9.
- `fast-uri 3.0.0 - 3.1.4 || 4.0.0 - 4.1.1` (host confusion) — split-resolved to 3.1.5 and 4.1.2.
- `glob 11.0.0 - 11.0.3` (command injection via `-c/--cmd`) — overridden to `^11.1.0`.

### Verification
- `npm audit --audit-level=high`: 0 vulnerabilities (was 3 high).
- `npm run lint`: clean.
- `npm run typecheck`: clean.
- `npm test`: 213/213 tests passed (52 test files).
- `npm run build`: production build succeeded.
- `npm run test:document-layout`, `npm run test:pgd-pdf`, `npm run test:storage-policy`: 0 failures.
- `npm run test:mrn16-sql`, `npm run test:mrn17-sql`, `npm run test:outbound-replacement-sql`: all passed.
- `git diff --check`: no whitespace errors.