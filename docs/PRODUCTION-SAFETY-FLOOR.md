# Production safety floor

This commit is the source-bound safety floor for the integrated production release.

The safety-floor deployment is Worker-only and keeps the checked-in runtime and public
frontend unchanged. All public feature switches remain at their reviewed default-off
values; the guarded release wrapper may set maintenance mode only for the short migration
bridge. The production zone remains paused throughout the release sequence.

The commit is intentionally additive documentation from the current protected `main`
checkout. It exists to bind the safety-floor deployment to a current, reachable source
commit without reviving the historical divergent safety-floor branch.
