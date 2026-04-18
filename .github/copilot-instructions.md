# Repository instructions for Copilot and coding agents

## Versioning policy for feature pull requests

When implementing a **new feature** for this repository, always include a version bump in `package.json` in the same pull request.

Use semantic versioning:

- **MAJOR** (`X.0.0`) for breaking changes.
- **MINOR** (`x.Y.0`) for backwards-compatible feature additions.
- **PATCH** (`x.y.Z`) for backwards-compatible bug fixes and small maintenance changes.

If the request is specifically a new feature and there is no breaking change, default to a **MINOR** bump.

## Pull request expectations

For feature pull requests:

- Ensure `package.json` version is updated according to semver.
- Mention the version bump decision in the PR description.
