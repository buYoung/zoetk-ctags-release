# zoekt-ctags-release

[zoekt](https://github.com/sourcegraph/zoekt)(`zoekt-webserver`, `zoekt-git-index`, `zoekt-index`)와
[universal-ctags](https://github.com/universal-ctags/ctags)를 **호스트에 그대로 두고 실행 가능한 정적
바이너리**로 빌드하여, 플랫폼별 아카이브로 묶어 GitHub Release로 발행하는 저장소입니다.

Docker 컨테이너를 운영에 쓸 수 없는 환경을 전제로 하며, 공식 컨테이너 이미지(`ghcr.io/sourcegraph/zoekt`)
대신 직접 빌드·패키징합니다.

## 무엇을 만드나

- **타깃 6종**: `linux`, `macos`, `windows` × `amd64`, `arm64`
- **ctags**: 전 플랫폼 동일하게 `+json +interactive`만 포함하는 **minimal · self-contained · stripped** 빌드.
  zoekt가 ctags를 JSON/interactive 모드로 호출하므로 `libjansson`은 필수(정적 링크). 그 외 의존성은
  시스템 라이브러리뿐이라 추가 설치 없이 동작합니다.
- **zoekt**: 순수 Go(`CGO_ENABLED=0`)라 단일 Linux 러너에서 전 타깃 크로스컴파일.

## 왜 직접 빌드/벤더링하나

- zoekt는 prebuilt 바이너리 릴리스도, semver 태그도 없습니다(커밋 SHA만 존재).
- universal-ctags도 안정 버전 호스트 바이너리를 제공하지 않습니다(특히 Windows).
- zoekt는 업스트림 상태로는 **Windows를 컴파일조차 못 합니다**(인덱스 mmap·`unix.Umask`가 Unix 전용).
  Windows 지원은 미머지 [PR #941](https://github.com/sourcegraph/zoekt/pull/941)에만 있습니다.

→ 그래서 zoekt 소스를 **이 저장소에 벤더링**하고(Windows 패치 적용 상태), ctags는 빌드 시점에 핀된 소스를
가져와 빌드합니다. 자세한 출처·패치·업데이트 절차는 [`third_party/zoekt/VENDOR.md`](third_party/zoekt/VENDOR.md) 참고.

## 지원 현황

| 타깃 | 빌드 | 런타임 검증 |
|------|------|-------------|
| linux-amd64 / linux-arm64 | ✅ | ✅ (인덱싱 + `sym:` 검색 E2E) |
| macos-amd64 / macos-arm64 | ✅ | ✅ (E2E; Intel은 Rosetta 경유) |
| windows-amd64 / windows-arm64 | ✅ | ⬜ **미검증** (실제 Windows 실행 미확인) |

> Windows는 **빌드·self-contained까지만 검증**됐습니다. zoekt.exe는 미머지 PR #941에 의존하므로,
> 실제 인덱싱/서빙 동작은 Windows 실기 또는 Wine으로 별도 검증이 필요합니다.

## 빌드 방식

| 컴포넌트 | 방식 |
|----------|------|
| zoekt (전 타깃) | 벤더 소스(`third_party/zoekt`)를 Go로 크로스컴파일 (Linux 단일 러너) |
| ctags (linux) | Alpine(musl)에서 정적 빌드 → 어느 배포판에서도 동작 |
| ctags (macos) | macOS 러너에서 소스 jansson 정적 링크 (Linux→macOS 크로스는 안 함) |
| ctags (windows) | **단일 `llvm-mingw` toolchain**으로 Linux에서 x86_64·arm64 크로스 (MSVC·MSYS2·Windows 러너 불필요) |

ctags의 minimal 기능 세트는 `PKG_CONFIG_LIBDIR`을 빈/스코핑된 디렉터리로 지정해 yaml/pcre2/xml2
자동탐지를 차단하고 jansson만 정적 링크하는 방식으로 전 플랫폼 통일합니다.

## 사용법

### 릴리스 발행

태그를 push하면 빌드 → 패키징 → GitHub Release 업로드가 진행됩니다.

```bash
git tag v0.1.0 && git push origin v0.1.0
```

빌드만 확인하려면 Actions 탭에서 `workflow_dispatch`로 수동 실행하세요(릴리스 없이 아티팩트만 생성).

### 버전 고정

- **zoekt**: 벤더링된 소스가 곧 핀입니다. 업스트림을 새 SHA로 올리려면 `third_party/zoekt/VENDOR.md`의 절차를 따르세요.
- **ctags**: `.github/workflows/release.yml` 상단 `env`의 `CTAGS_REF` / `CTAGS_TARBALL_DIR`로 고정합니다.

### 로컬 검증 (act, 선택)

[`act`](https://github.com/nektos/act)로 Linux 잡을 로컬에서 미리 돌려볼 수 있습니다(Docker 필요). macOS·Windows
잡은 act가 실행할 수 없습니다. 자세한 한계는 [`.actrc`](.actrc) 주석 참고.

```bash
act -j build-zoekt        # zoekt 크로스컴파일
act -j build-ctags-linux  # Alpine musl 정적 빌드 + jansson 검증
```

## 산출물

플랫폼별로 zoekt 3종 + `universal-ctags`(Windows는 `.exe`)가 하나의 아카이브로 묶입니다.

- Unix: `zoekt-ctags-<os>-<arch>.tar.gz`
- Windows: `zoekt-ctags-<os>-<arch>.zip`

## 런타임 주의사항

- **`git` 필요**: `zoekt-git-index`는 호스트의 `git` 실행 파일을 호출합니다. 배포 호스트에 git이 있어야 합니다.
- **macOS Gatekeeper**: 산출 바이너리는 서명/노터라이즈되어 있지 않습니다. macOS에서 "확인되지 않은 개발자"
  차단이 뜰 수 있습니다(`xattr -dr com.apple.quarantine` 또는 codesign/notarization 별도 적용).
- **Windows 런타임 미검증**: 위 "지원 현황" 참고. 빌드는 되나 실제 동작은 미확인입니다.

## 저장소 구조

```
.github/workflows/release.yml   # 빌드·패키징·릴리스 워크플로
third_party/zoekt/              # 벤더링된 zoekt 소스 (+ Windows 패치) + VENDOR.md
patches/                        # 업스트림 대비 divergence(Windows 지원 패치)
.actrc                          # act 로컬 실행용 러너 매핑
```
