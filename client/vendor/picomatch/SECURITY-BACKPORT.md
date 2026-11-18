# Temporary build dependency: picomatch

This private `@taperday/picomatch@4.0.7-taperday.1` replaces all installed
`picomatch` consumers through the root npm override. It is not a published
upstream release. It is used by Vite, Vitest, tinyglobby and fdir, not application
code delivered to runners.

## Provenance and change

- Base: the MIT-licensed npm `picomatch@4.0.7` distribution, upstream commit
  `6bb40679c218cefba5d4e9662408c5fdf699a8bb`.
- Original npm integrity:
  `sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==`.
- Backport: the `lib/parse.js` diff from
  [upstream PR #262](https://github.com/micromatch/picomatch/pull/262), commit
  `3222059ac27492d9c0147fee5c65f751bbd851ab`, plus removal of an unused catch
  binding for repository lint. The complete delta is preserved as `security.patch`.
- Original runtime files, README and MIT licence are retained. The private
  package manifest identifies the fork and omits upstream development tools.
  There are no installation scripts or new runtime dependencies.

[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
allows repeated wildcard extglobs to create nested unbounded regex repetitions.
This backport uses actual parser tokens to detect wildcard branches, removes
redundant repetition for restricted equivalent forms and uses the existing
literal fallback for unsupported unsafe forms. It preserves ordinary matching,
including the existing repeated-alternative and folder-name examples.

The upstream patch is proposed, **not maintainer-approved or released**, as of
18 November 2026. Unsupported unsafe capture/alternative forms intentionally
become literal matches. The upstream `maxExtglobRecursion: false` safety opt-out
is retained; Taperday's build configuration does not use it. This does not
promise safe execution of arbitrary regex/glob syntax.

## Required checks and removal

`npm run test:security` checks the installed matcher used by every build/test
consumer and runs the advisory's attack families in kill-bounded child
processes. Normal matching is also checked. It runs in the local check script
and required frontend CI. A blocked regex cannot interrupt its own event loop,
so these checks use an external two-second deadline.

`npm audit --audit-level=high` is unchanged. The advisory database does not
recognize this private fork: a clean audit alone does **not** validate the
backport. The mandatory attack regressions, upstream suite and full application
CI provide the additional evidence. No advisory, threshold or existing test
assertion is suppressed.

When an official patched release appears, remove the override and this vendor
directory, update the lockfile and adapt the resolution check to require the
official patched version. Keep the exploit and compatibility regressions. Run
the full checks and audit before removing this backport.
