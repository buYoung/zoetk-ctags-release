# zoekt-ctags-release

> [zoekt](https://github.com/sourcegraph/zoekt)와 [universal-ctags](https://github.com/universal-ctags/ctags)를
> **호스트 배포용 정적 바이너리**로 빌드·패키징하는 멀티플랫폼 릴리스 저장소

![platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-blue)
![arch](https://img.shields.io/badge/arch-x86__64%20%7C%20arm64-blue)
![build](https://img.shields.io/badge/build-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)
![ctags](https://img.shields.io/badge/ctags-static%20%C2%B7%20%2Bjson%20%2Binteractive-success)

**한국어** | [English](README.en.md)

Docker 컨테이너를 운영에 쓸 수 없는 환경을 전제로, 공식 컨테이너 이미지(`ghcr.io/sourcegraph/zoekt`) 대신
zoekt 바이너리(`zoekt-webserver`, `zoekt-git-index`, `zoekt-index`)와 `universal-ctags`를 직접 빌드하여
플랫폼별 아카이브로 묶어 GitHub Release로 발행합니다.

## 목차

- [배경](#배경)
- [특징](#특징)
- [지원 현황](#지원-현황)
- [빠른 시작](#빠른-시작)
- [빌드 방식](#빌드-방식)
- [버전 고정](#버전-고정)
- [산출물](#산출물)
- [런타임 요구사항](#런타임-요구사항)
- [저장소 구조](#저장소-구조)
- [라이선스](#라이선스)

## 배경

이 저장소의 `zoekt + universal-ctags` 조합은, 코드 검색·분석 도구들(zoekt·ctags·LSP·AST 등)을 여러
파이프라인으로 엮어 비교한 벤치마크에서 **`zoekt(텍스트 인덱스) + ctags(심볼 인덱스) → read` 조합이
비용·속도·품질 균형이 가장 우수**하다는 결론에서 출발했습니다. 화려한 다단계 파이프라인보다 이 가벼운
조합이 실용적으로 최적이라는 결과가, 바로 이 조합을 호스트 배포용 바이너리로 묶게 된 계기입니다.

- 벤치마크 상세: [results-combos.md](https://github.com/buYoung/intellij-jsoninja/blob/main/evals/workflow-combos/results-combos.md) — [buYoung/intellij-jsoninja](https://github.com/buYoung/intellij-jsoninja)

## 특징

- **타깃 6종**: `linux` · `macos` · `windows` × `amd64` · `arm64`
- **self-contained**: 시스템 라이브러리 외 추가 의존성 없음 (Linux는 musl 정적, macOS/Windows는 jansson 등 정적 링크)
- **ctags 기능 통일**: 전 플랫폼 `+json +interactive`만 포함(minimal). zoekt 심볼 검색에 필요한 최소 세트이며,
  `libjansson` 누락 시 검색이 조용히 깨지는 문제를 빌드 단계에서 차단
- **stripped**: 디버그 심볼 제거로 용량 최소화
- **단일 toolchain**: Windows ctags는 `llvm-mingw` 하나로 x86_64·arm64 모두 Linux에서 크로스 (MSVC·MSYS2·Windows 러너 불필요)
- **재현 가능**: zoekt는 저장소에 벤더링, ctags 소스는 버전 핀

## 지원 현황

| 타깃 | 빌드 | 런타임 검증 |
|------|:----:|:-----------:|
| linux-amd64 / linux-arm64 | ✅ | ✅ 인덱싱 + `sym:` 검색 E2E |
| macos-amd64 / macos-arm64 | ✅ | ✅ E2E (Intel은 Rosetta 경유) |
| windows-amd64 / windows-arm64 | ✅ | ⬜ **미검증** |

> **Windows 런타임 주의**: 빌드와 self-contained는 검증됐지만, zoekt의 Windows 지원은 미머지
> [PR #941](https://github.com/sourcegraph/zoekt/pull/941)에 의존합니다. 실제 인덱싱/서빙 동작은 Windows
> 실기 또는 Wine으로 별도 확인이 필요합니다.

## 빠른 시작

### 릴리스 발행

버전 증가·태깅·push는 [release-it](https://github.com/release-it/release-it)으로 수행합니다(반자동화 통제형).

1. **changelog 작성** — codex로 `CHANGELOG.md`의 새 버전 섹션을 작성하고 검토합니다.
2. **release-it 실행** — `pnpm release`를 실행하면 대화형으로 버전 선택 → 커밋(`chore: release vX.Y.Z`) → `vX.Y.Z` 태그 → push를 **각 단계 확인 후** 진행합니다.

```bash
pnpm install        # 최초 1회 (release-it 설치)
pnpm release        # 대화형 릴리스 (각 단계 확인)
pnpm release minor  # 증가량 명시 (patch / minor / major)
pnpm release 0.1.0  # 버전 직접 지정 (첫 릴리스 권장)
pnpm release:dry    # 변경 없이 동작만 미리보기
```

3. **CI 자동 진행** — push된 `vX.Y.Z` 태그가 빌드 → 패키징 → GitHub Release 생성을 트리거합니다. 릴리스 본문에는 `CHANGELOG.md`의 해당 버전 섹션이 먼저 들어가고, 빌드·무결성·라이선스 노트가 이어집니다.

> changelog는 release-it이 자동 생성하지 않습니다(codex가 작성·검토). release-it은 버전·태그·push만 담당하고,
> GitHub Release는 CI가 단독으로 생성합니다(이중 생성 방지). `git add . --update`는 추적 중인 변경만 담으므로
> release 전 `CHANGELOG.md` 외 불필요한 변경은 정리하세요.

릴리스 없이 빌드만 확인하려면 Actions 탭에서 `workflow_dispatch`로 수동 실행하세요.
수동 태깅(`git tag vX.Y.Z && git push origin vX.Y.Z`)도 동일하게 CI를 트리거합니다(이 경우 changelog는 codex 검토 없이 `CHANGELOG.md` 상태 그대로 반영).

### 로컬 검증 (선택)

[`act`](https://github.com/nektos/act)로 Linux 잡을 로컬에서 미리 실행할 수 있습니다(Docker 필요).
macOS·Windows 잡은 act가 실행할 수 없습니다. 한계는 [`.actrc`](.actrc) 주석 참고.

```bash
act -j build-zoekt        # zoekt 크로스컴파일
act -j build-ctags-linux  # Alpine musl 정적 빌드 + jansson 검증
```

## 빌드 방식

| 컴포넌트 | 방식 |
|----------|------|
| zoekt (전 타깃) | 벤더 소스(`third_party/zoekt`)를 Go로 크로스컴파일 — `CGO_ENABLED=0`, Linux 단일 러너 |
| ctags (linux) | Alpine(musl)에서 정적 빌드 → 배포판 무관 동작 |
| ctags (macos) | macOS 러너에서 소스 jansson 정적 링크 |
| ctags (windows) | **`llvm-mingw` 단일 toolchain**으로 Linux에서 x86_64·arm64 크로스 |

ctags의 minimal 기능 세트는 `PKG_CONFIG_LIBDIR`을 스코핑해 yaml/pcre2/xml2 자동탐지를 차단하고 jansson만
정적 링크하는 방식으로 전 플랫폼 통일합니다.

> zoekt는 업스트림 상태로는 **Windows를 컴파일조차 못 합니다**(인덱스 mmap·`unix.Umask`가 Unix 전용).
> 그래서 Windows 지원 패치(PR #941)를 적용한 소스를 [`third_party/zoekt`](third_party/zoekt)에 벤더링합니다.

## 버전 고정

- **zoekt**: 벤더링된 소스가 곧 핀입니다. 새 SHA로 올리는 절차는 [`third_party/zoekt/VENDOR.md`](third_party/zoekt/VENDOR.md) 참고.
- **ctags**: [`.github/workflows/release.yml`](.github/workflows/release.yml) 상단 `env`의 `CTAGS_REF` / `CTAGS_TARBALL_DIR`로 고정.

## 산출물

플랫폼별로 zoekt 3종 + `universal-ctags`(Windows는 `.exe`)가 하나의 아카이브로 묶입니다.

| OS | 아카이브 |
|----|----------|
| Linux / macOS | `zoekt-ctags-<os>-<arch>.tar.gz` |
| Windows | `zoekt-ctags-<os>-<arch>.zip` |

### 무결성 검증 (SHA-256)

각 릴리스에는 체크섬 파일이 함께 첨부됩니다. 해시 대상은 다운로드하는 **아카이브 파일 자체**(`.tar.gz`/`.zip`)와
GPL 소스 tarball(`SOURCE-*.tar.gz`)입니다.

- 자산별 `<파일명>.sha256` — 단일 파일 검증용 (`sha256sum` 형식)
- `SHA256SUMS` — 모든 자산 해시를 담은 단일 매니페스트

```bash
# 단일 파일 검증
sha256sum -c zoekt-ctags-linux-amd64.tar.gz.sha256

# 받은 파일만 통합 매니페스트로 검증
#   --ignore-missing 필수: 받지 않은 다른 플랫폼/소스 항목은 건너뜁니다(없으면 실패로 잡힘).
sha256sum --ignore-missing -c SHA256SUMS
```

> `sha256sum`이 없는 macOS에서는 `shasum -a 256 ...`로 동일하게 동작합니다.
> 해시는 해당 릴리스 산출물 기준입니다(tar/gzip이 mtime을 포함하므로 재빌드 시 값이 달라질 수 있음).

## 런타임 요구사항

- **`git`**: `zoekt-git-index`는 호스트의 `git` 실행 파일을 호출하므로 배포 호스트에 git이 설치돼 있어야 합니다.
- **macOS Gatekeeper**: 산출 바이너리는 서명/노터라이즈되어 있지 않습니다. 차단 시 `xattr -dr com.apple.quarantine`
  또는 codesign/notarization을 별도 적용하세요.
- **Windows**: 런타임 미검증 — 위 [지원 현황](#지원-현황) 참고.

## 저장소 구조

```
.github/workflows/release.yml   # 빌드 · 패키징 · 릴리스 워크플로
third_party/zoekt/              # 벤더링된 zoekt 소스(+ Windows 패치) + VENDOR.md
patches/                        # 업스트림 대비 divergence(Windows 지원 패치)
.release-it.json                # release-it 설정 (버전·태그·push 담당; GitHub Release는 CI)
CHANGELOG.md                    # 릴리스 노트 (codex 작성·검토, CI가 릴리스 본문에 주입)
package.json                    # pnpm + release-it 도구 정의 (private, npm 미발행)
.actrc                          # act 로컬 실행용 러너 매핑
```

## 라이선스

- **이 저장소 자체**(워크플로·문서·패치): [Apache-2.0](LICENSE)
- 배포되는 바이너리는 각 원 프로젝트 라이선스를 따릅니다:
  - zoekt — Apache-2.0 (소스는 `third_party/zoekt`에 벤더링)
  - **universal-ctags — GPL-2.0-or-later** (Windows 빌드는 LGPL-2.1+ libiconv를 정적 링크)
  - jansson — MIT

> universal-ctags는 카피레프트(GPL)입니다. 번들 구성요소 목록과 GPL/LGPL **대응 소스 제공 의무**는
> [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 정리돼 있으며, 각 릴리스에 소스 tarball(`SOURCE-*.tar.gz`)이 첨부됩니다.
> zoekt는 ctags를 서브프로세스로 호출하는 별도 프로그램이라 GPL 전염 없이 Apache-2.0를 유지합니다.
