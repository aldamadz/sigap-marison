# Changelog

## 2026-07-14

### Cleanup and hardening

- Removed high-confidence dead source, orphan notification code, unused UI wrappers, temporary tracked artifacts, and their direct dependencies.
- Consolidated application notifications on Sonner.
- Standardized application roles to `admin` and `user` through source updates and a new normalization migration.
- Retired the separate inbound read-only integration service while preserving outbound MARISON integration.
- Disabled public production source maps.
- Hardened authenticated storage uploads, Docker build context, and deterministic dependency installation.
- Added static cleanup and security regression guardrails.
