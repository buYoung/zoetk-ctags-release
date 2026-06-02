# zoekt-ctags-release

> Multi-platform release builds of [zoekt](https://github.com/sourcegraph/zoekt) and
> [universal-ctags](https://github.com/universal-ctags/ctags) as **self-contained static binaries**

![platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-blue)
![arch](https://img.shields.io/badge/arch-x86__64%20%7C%20arm64-blue)
![build](https://img.shields.io/badge/build-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)
![ctags](https://img.shields.io/badge/ctags-static%20%C2%B7%20%2Bjson%20%2Binteractive-success)

[한국어](README.md) | **English**

For environments where Docker can't be used in production, this repo builds the zoekt binaries
(`zoekt-webserver`, `zoekt-git-index`, `zoekt-index`) and `universal-ctags` directly — instead of using
the official container image (`ghcr.io/sourcegraph/zoekt`) — and publishes per-platform archives as
GitHub Releases.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Support Status](#support-status)
- [Quick Start](#quick-start)
- [How It's Built](#how-its-built)
- [Version Pinning](#version-pinning)
- [Artifacts](#artifacts)
- [Runtime Requirements](#runtime-requirements)
- [Repository Layout](#repository-layout)
- [License](#license)

## Background

The `zoekt + universal-ctags` pairing here came out of a benchmark that compared several pipelines of
code-search/analysis tools (zoekt, ctags, LSP, AST, etc.) and found that **`zoekt (text index) + ctags
(symbol index) → read` gives the best cost/speed/quality balance** — a lightweight pair that beats more
elaborate multi-stage pipelines. That result is what motivated packaging this exact combo as
host-deployable binaries.

- Benchmark details: [results-combos.md](https://github.com/buYoung/intellij-jsoninja/blob/main/evals/workflow-combos/results-combos.md) — [buYoung/intellij-jsoninja](https://github.com/buYoung/intellij-jsoninja)

## Features

- **6 targets**: `linux` · `macos` · `windows` × `amd64` · `arm64`
- **Self-contained**: no dependencies beyond system libraries (musl-static on Linux; jansson etc. statically linked on macOS/Windows)
- **Uniform ctags features**: `+json +interactive` only (minimal) on every platform — the minimum zoekt symbol search needs;
  a missing `libjansson` (which silently breaks search) is caught at build time
- **Stripped**: debug symbols removed to minimize size
- **Single toolchain**: Windows ctags is cross-compiled for both x86_64 and arm64 from Linux with one `llvm-mingw` toolchain (no MSVC, MSYS2, or Windows runners)
- **Reproducible**: zoekt is vendored into the repo; the ctags source is version-pinned

## Support Status

| Target | Build | Runtime-verified |
|--------|:-----:|:----------------:|
| linux-amd64 / linux-arm64 | ✅ | ✅ index + `sym:` search E2E |
| macos-amd64 / macos-arm64 | ✅ | ✅ E2E (Intel via Rosetta) |
| windows-amd64 / windows-arm64 | ✅ | ⬜ **not verified** |

> **Windows runtime caveat**: the build and self-containment are verified, but zoekt's Windows support
> relies on the unmerged [PR #941](https://github.com/sourcegraph/zoekt/pull/941). Actual indexing/serving
> must be confirmed separately on real Windows or via Wine.

## Quick Start

### Publish a release

changelog authoring (codex) and version bump/tag/push (release-it) happen in **one `pnpm release`**,
human-in-the-loop. Running `pnpm release` walks interactively through:

1. **Generate the changelog (codex)** — at the start, codex analyzes the commits since the last tag and
   writes **user-facing** English entries (from the perspective of someone who downloads and runs the
   binaries) under `## [Unreleased]` in `CHANGELOG.md`. Implementation detail, file paths, commit hashes,
   etc. are excluded. (requires the codex CLI)
2. **Choose the version** — pick the increment (patch/minor/major) or a version; release-it shows the
   generated changelog as a preview.
3. **Confirm (the yes gate)** — release-it asks **yes/no for commit → tag → push, each separately**. At the
   commit prompt you review the changelog and say yes; keep-a-changelog then converts `## [Unreleased]`
   into `## [X.Y.Z] - date` and commits (`chore: release vX.Y.Z`).
4. **CI takes over** — the pushed `vX.Y.Z` tag triggers build → package → GitHub Release; the body leads
   with that version's changelog, followed by the build/integrity/licensing notes.

```bash
pnpm install        # once (installs release-it and friends)
pnpm release        # codex generation + interactive release (yes/no per commit/tag/push)
pnpm release minor  # explicit increment (patch / minor / major)
pnpm release 0.1.0  # explicit version (recommended for the first release)
```

> - The changelog content is authored by codex and reviewed by you (not auto-generated). release-it only
>   handles version/tag/push and the `[Unreleased] → [version]` conversion; the GitHub Release is created
>   solely by CI (no double-creation).
> - If you answer **no** at the commit prompt, the already-converted `CHANGELOG.md` (`## [X.Y.Z]`) and the
>   bumped `package.json` remain on disk — revert with `git checkout -- CHANGELOG.md package.json`. Running
>   `pnpm release` again regenerates the changelog with codex.
> - Since `git add . --update` stages only tracked changes, clean up unrelated edits before releasing.

To check the build without publishing, run `workflow_dispatch` manually from the Actions tab.
Manual tagging (`git tag vX.Y.Z && git push origin vX.Y.Z`) triggers CI the same way (the changelog is
then taken from `CHANGELOG.md` as-is, without the codex step).

### Local verification (optional)

Use [`act`](https://github.com/nektos/act) to run the Linux jobs locally (Docker required). The macOS and
Windows jobs cannot run under act. See the comments in [`.actrc`](.actrc) for the limitations.

```bash
act -j build-zoekt        # zoekt cross-compile
act -j build-ctags-linux  # Alpine musl static build + jansson check
```

## How It's Built

| Component | Method |
|-----------|--------|
| zoekt (all targets) | Go cross-compile from vendored source (`third_party/zoekt`) — `CGO_ENABLED=0`, single Linux runner |
| ctags (linux) | Static build on Alpine (musl) → distro-independent |
| ctags (macos) | Static jansson link on macOS runners |
| ctags (windows) | Cross-compiled for x86_64 & arm64 from Linux with a single **`llvm-mingw`** toolchain |

The minimal ctags feature set is achieved on every platform by scoping `PKG_CONFIG_LIBDIR` to block
auto-detection of yaml/pcre2/xml2 and statically linking only jansson.

> Upstream zoekt **does not even compile for Windows** (the index mmap and `unix.Umask` are Unix-only).
> The Windows-support patch (PR #941) is therefore applied to the source vendored under
> [`third_party/zoekt`](third_party/zoekt).

## Version Pinning

- **zoekt**: the vendored source *is* the pin. To bump to a new upstream SHA, follow the procedure in
  [`third_party/zoekt/VENDOR.md`](third_party/zoekt/VENDOR.md).
- **ctags**: pinned via `CTAGS_REF` / `CTAGS_TARBALL_DIR` in the `env` block of
  [`.github/workflows/release.yml`](.github/workflows/release.yml).

## Artifacts

Each platform bundles the 3 zoekt binaries + `universal-ctags` (`.exe` on Windows) into one archive.

| OS | Archive |
|----|---------|
| Linux / macOS | `zoekt-ctags-<os>-<arch>.tar.gz` |
| Windows | `zoekt-ctags-<os>-<arch>.zip` |

### Integrity verification (SHA-256)

Every release ships checksum files. The hash target is the **downloaded archive itself**
(`.tar.gz`/`.zip`) and the GPL source tarballs (`SOURCE-*.tar.gz`).

- `<name>.sha256` per asset — single-file verification (`sha256sum` format)
- `SHA256SUMS` — one manifest with the hashes of every asset

```bash
# verify a single file
sha256sum -c zoekt-ctags-linux-amd64.tar.gz.sha256

# verify only what you downloaded against the combined manifest
#   --ignore-missing is required: entries for assets you didn't download are skipped
#   (otherwise they count as failures).
sha256sum --ignore-missing -c SHA256SUMS
```

> On macOS without `sha256sum`, use `shasum -a 256 ...` (same checksum-file format).
> Hashes are per release artifact (tar/gzip embed mtimes, so a rebuild may produce different values).

## Runtime Requirements

- **`git`**: `zoekt-git-index` shells out to the host's `git`, so it must be installed on the deployment host.
- **macOS Gatekeeper**: binaries are unsigned/un-notarized. If blocked, run `xattr -dr com.apple.quarantine`,
  or apply codesign/notarization separately.
- **Windows**: runtime not verified — see [Support Status](#support-status).

## Repository Layout

```
.github/workflows/release.yml   # build · package · release workflow
third_party/zoekt/              # vendored zoekt source (+ Windows patch) + VENDOR.md
patches/                        # divergence from upstream (Windows-support patch)
.release-it.json                # release-it config (version/tag/push + [Unreleased]→[version] + codex hook)
CHANGELOG.md                    # release notes (authored/reviewed via codex, injected into the release body by CI)
scripts/                        # update-changelog-with-codex.cjs — run by release-it's before:init hook
package.json                    # pnpm + release-it tooling (private, not published to npm)
.actrc                          # runner mappings for local `act` runs
```

## License

- **This repository itself** (workflow, docs, patches): [Apache-2.0](LICENSE)
- Distributed binaries are under their upstream licenses:
  - zoekt — Apache-2.0 (source vendored in `third_party/zoekt`)
  - **universal-ctags — GPL-2.0-or-later** (Windows builds statically link LGPL-2.1+ libiconv)
  - jansson — MIT

> universal-ctags is copyleft (GPL). The bundled-component list and the GPL/LGPL **corresponding-source
> obligation** are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); each release attaches the
> source tarballs (`SOURCE-*.tar.gz`). zoekt invokes ctags as a separate subprocess, so it stays Apache-2.0
> without GPL contamination.
