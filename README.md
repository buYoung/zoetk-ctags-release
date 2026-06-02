# zoekt-ctags-release

[zoekt](https://github.com/sourcegraph/zoekt) 바이너리(`zoekt-webserver`, `zoekt-git-index`, `zoekt-index`)와
[universal-ctags](https://github.com/universal-ctags/ctags)를 **호스트에 그대로 배포 가능한 바이너리** 형태로
빌드해 플랫폼별 아카이브로 묶어 GitHub Release로 발행하는 저장소입니다.

Docker 컨테이너를 운영에 쓸 수 없는 환경을 전제로 하며, 그래서 공식 컨테이너 이미지
(`ghcr.io/sourcegraph/zoekt`) 대신 직접 빌드/패키징합니다.

## 왜 직접 빌드하나

- zoekt는 prebuilt 바이너리 릴리스를 제공하지 않습니다(소스 빌드 또는 컨테이너만 존재).
- universal-ctags도 안정 버전 호스트 바이너리를 제공하지 않으며, **Windows 바이너리는 nightly에 아예 없습니다.**
- zoekt의 심볼 검색은 ctags를 **JSON/interactive 모드**로 호출하므로, ctags가 **libjansson(JSON) 포함**으로
  빌드되어야 합니다. 누락 시 에러 없이 심볼 검색만 조용히 깨집니다. 그래서 빌드 직후 모든 셀에서
  `ctags --list-features` 로 `json`/`interactive` 포함 여부를 자동 검증합니다.

## 빌드 매트릭스

> **현재 상태**: 이 워크플로는 1차 스캐폴드이며 **아직 CI에서 실행된 적이 없습니다.** 아래 "예상"은
> 설계상 정상 동작을 의미할 뿐, 첫 dispatch 실행 전까지 어느 셀도 "검증됨"이 아닙니다. 첫 실행에서
> 손볼 가능성이 높은 지점은 아래 "첫 실행 시 예상 난관"을 참고하세요.

| 타깃 | zoekt | universal-ctags | 상태 |
|------|-------|-----------------|------|
| linux-amd64 | 크로스컴파일 | musl static (alpine) | 예상(미실행) |
| linux-arm64 | 크로스컴파일 | musl static (alpine, arm64 러너) | 예상(미실행) |
| macos-amd64 | 크로스컴파일 | jansson 정적 링크 (macos-13) | 예상(미실행) |
| macos-arm64 | 크로스컴파일 | jansson 정적 링크 (macos-14) | 예상(미실행) |
| windows-amd64 | 크로스컴파일 | MSYS2 UCRT64 static | 예상(미실행) |
| **windows-arm64** | 크로스컴파일 | MSYS2 CLANGARM64 static | ⚠️ **best-effort, 미검증** |

### 첫 실행 시 예상 난관

- **Alpine 컨테이너 + JS 액션**: `actions/upload-artifact` 등은 glibc Node로 동작하는데 Alpine은 musl이라
  `libc6-compat`/`gcompat` 없이는 실패합니다(워크플로에 반영해 두었으나 실제 실행 검증 필요).
- **macOS 정적 jansson**: Homebrew `jansson`이 `libjansson.a`(정적 라이브러리)를 제공하는지, 그리고
  ctags configure가 `JANSSON_LIBS`/`JANSSON_CFLAGS` 오버라이드를 존중하는지 확인 필요. 둘 중 하나라도
  어긋나면 configure 실패 또는 dylib 동적 링크로 조용히 떨어질 수 있습니다.
- **windows-arm64**: CLANGARM64 환경에 mingw jansson 패키지가 없을 수 있어, 이 셀은 실패 가능성을 전제로
  `continue-on-error` 처리했습니다.

- zoekt는 순수 Go(`CGO_ENABLED=0`, upstream Dockerfile 기준)라 단일 Linux 러너에서 6타깃을 전부 크로스컴파일합니다.
- ctags는 C/autotools라 **각 아키텍처 러너에서 네이티브로 빌드**합니다. 덕분에 jansson 검증도 그 자리에서 실행됩니다.
- `windows-arm64`는 누구도 사전 검증할 수 없는 셀이라 `continue-on-error`로 분리했고, 실패해도 나머지 5개 릴리스를 막지 않습니다.

## 버전 고정(핀)

재현성을 위해 `.github/workflows/release.yml` 상단 `env`에 SHA/태그를 박아둡니다. **floating 브랜치 추종 금지.**

```yaml
ZOEKT_REF: 3b6cf8a969d7a81e9d04d3bb7de1da8f57e1178c   # sourcegraph/zoekt commit
CTAGS_REF: v6.1.0                                       # universal-ctags tag
CTAGS_TARBALL_DIR: ctags-6.1.0                          # 위 태그의 tarball 최상위 디렉터리명
```

> `CTAGS_REF`는 zoekt의 `install-ctags-alpine.sh`가 핀한 버전과 맞춥니다(현재 v6.1.0).
> zoekt가 새 ctags로 올리면 그때 함께 올리세요. 최신 안정 태그는 v6.2.1이지만, zoekt 검증 조합을 우선합니다.

버전을 올릴 때는 `ZOEKT_REF`, `CTAGS_REF`, `CTAGS_TARBALL_DIR` 세 값을 함께 갱신합니다.

## 사용법

1. 위 핀 값을 원하는 버전으로 설정합니다.
2. 릴리스 발행: 태그를 push 하면 됩니다.
   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```
   태그 push 시 빌드 → 패키징 → GitHub Release 업로드까지 진행됩니다.
3. 빌드만 확인하려면 Actions 탭에서 `workflow_dispatch`로 수동 실행하세요(릴리스 발행 없이 아티팩트만 생성).

## 로컬 검증 (act)

[`act`](https://github.com/nektos/act)로 워크플로 일부를 로컬에서 미리 돌려볼 수 있습니다. Docker가 필요합니다.

```bash
brew install act          # 설치 (Docker는 별도 실행 중이어야 함)
```

**act가 검증할 수 있는 범위는 Linux 잡뿐입니다.**

```bash
act -j build-zoekt        # zoekt 6타깃 크로스컴파일 (호스트 무관, 검증 가치 높음)
act -j build-ctags-linux  # Alpine musl static 빌드 + jansson 검증
```

- `build-ctags-macos` / `build-ctags-windows`는 act가 **실행할 수 없습니다**(macOS/Windows 러너 미지원).
  이 두 셀은 실제 `workflow_dispatch` 실행으로만 검증됩니다.
- arm64 Mac에서 `linux-amd64` 레그를 돌리면, `--container-architecture linux/amd64`를 주지 않는 한 act는
  에뮬레이션이 아니라 **arm64 `alpine` 이미지를 받아 amd64 라벨 아래에서 arm64 바이너리를 만들어 버립니다**
  (느린 게 아니라 아키텍처가 틀림). 충실한 amd64 빌드는 해당 플래그가 필요하고, `linux-arm64` 레그는 네이티브로 정확합니다.
- `build-zoekt`는 외부 레포(`sourcegraph/zoekt`)를 `actions/checkout` 합니다. act에서 checkout이 실패하면
  토큰을 넘기세요: `act -j build-zoekt -s GITHUB_TOKEN=$(gh auth token)`.
- 러너 라벨 매핑과 아티팩트 경로는 `.actrc`에 설정돼 있습니다.

> **주의**: 위 act 명령들도 이 환경에서 **아직 실행해 검증하지 않았습니다**(act 미설치). 워크플로와 마찬가지로
> "문서화됨, 미실행" 상태입니다. act는 YAML·셸 로직과 Linux/zoekt 빌드를 빠르게 반복 검증하는 용도이며,
> **실제 CI 실행의 대체재가 아닙니다.**

## 로컬 검증 기록 (E2E)

arm64 macOS 호스트 + Docker 환경에서 실제 빌드·검증한 결과입니다. 산출 바이너리는 `dist/`에 있습니다.

| 항목 | 상태 | 근거 |
|------|------|------|
| Linux arm64 빌드 + E2E | ✅ 검증 | 빈 alpine 컨테이너에서 `zoekt-git-index -require_ctags` 성공 + `sym:` 쿼리 히트 (네이티브) |
| Linux amd64 빌드 + E2E | ✅ 검증(QEMU) | 동일 절차, `--platform linux/amd64` 에뮬레이션 |
| macOS arm64 — **인덱싱 메커니즘** | ✅ 검증 | 호스트 네이티브에서 `-require_ctags` 성공 + `sym:` 히트 |
| macOS arm64 — **배포 가능성(self-contained)** | ✅ **충족 (최적화 후)** | 소스 arm64 jansson 정적 + `PKG_CONFIG_LIBDIR` 스코핑으로 yaml/pcre2/xml2 제거 → `otool -L`이 `/usr/lib`만, E2E 재검증 통과 |
| macOS amd64 (Intel) 빌드 + E2E | ✅ 검증(Rosetta) | x86_64 jansson 소스 빌드 후 `-arch x86_64` ctags + zoekt darwin/amd64 크로스컴파일, Rosetta로 인덱싱+`sym:` 히트. **self-contained**(otool: `/usr/lib`만) |
| Windows x64/arm64 — **빌드** | ✅ 빌드 검증 | zoekt: 벤더 소스(PR #941 패치)로 Go 크로스. ctags: **llvm-mingw 단일 toolchain**으로 Linux에서 크로스, PE32+(x86-64/Aarch64), DLL 의존성 시스템 DLL만(self-contained) 확인 |
| Windows x64/arm64 — **런타임** | ⬜ 미검증 | 네이티브 Windows 실행은 미검증(이 환경엔 Windows 없음) → 실기 또는 Wine 필요 |

### 최적화 적용 결과 (모든 플랫폼 minimal + self-contained + stripped)

`release.yml`에 반영 완료. ctags 기능 세트는 전 플랫폼 `+json +interactive`로 통일(parity), 의존성은 시스템 라이브러리만, strip로 용량 축소.

| 플랫폼 | strip 전 → 후 | self-contained |
|--------|---------------|----------------|
| linux-arm64 | 8.9MB → **2.0MB** | ✅ musl static |
| linux-amd64 | 8.6MB → **1.9MB** | ✅ musl static |
| macos-amd64 | 2.2MB → **1.9MB** | ✅ `/usr/lib`만 |
| macos-arm64 | 2.3MB → **1.8MB** (재빌드+strip) | ✅ `/usr/lib`만 |

레시피 핵심: macOS는 jansson을 소스에서 정적 빌드하고 `PKG_CONFIG_LIBDIR`을 빈 디렉터리로 지정해 Homebrew의 yaml/pcre2/xml2 자동탐지를 차단합니다. Linux(musl)는 jansson만 설치되어 본래 minimal이라 strip만 적용. **Windows는 llvm-mingw 단일 toolchain으로 Linux에서 x86_64·arm64 모두 크로스**(libiconv·jansson 소스 정적 빌드 + 동일 `PKG_CONFIG_LIBDIR` 스코핑 + `-static` + strip). MSVC·MSYS2·Windows 러너 불필요.

**검증된 것**: zoekt가 universal-ctags(+interactive)를 호출해 심볼을 추출하고, `sym:` 쿼리로 검색되는 **end-to-end 동작**(linux/macOS). Windows는 빌드 + self-contained까지 검증(런타임 미검증).

**해결됨 (최적화 단계에서 처리, 위 "최적화 적용 결과" 참고)**:
- ~~macOS ctags가 Homebrew `libyaml`/`pcre2` dylib에 의존~~ → `PKG_CONFIG_LIBDIR` 스코핑으로 제거, `/usr/lib`만 의존 (self-contained 충족).
- ~~기능 parity 불일치~~ → 전 플랫폼 `+json +interactive`로 통일.
- ~~macOS 최소 OS 불확실~~ → jansson을 소스에서 `-mmacosx-version-min`(arm64 11.0 / x86_64 10.15) 지정해 빌드, floor 제어.
- ~~Windows ctags toolchain 이원화(MSVC/mingw)~~ → **llvm-mingw 단일화**, Linux에서 양 arch 크로스, self-contained 확인.
- ~~zoekt Windows 미지원(컴파일 불가)~~ → 미머지 PR #941을 벤더 소스에 적용, 6타깃 전부 `go build` 통과.

**남은 것**: Windows **런타임** 검증만 (이 환경엔 Windows 없음 → 실기 또는 Wine). 빌드는 전 타깃 완료.

## 런타임 주의사항

- **`git` 의존**: `zoekt-git-index`는 호스트의 `git` 실행 파일을 호출합니다. 배포 호스트에 git이 설치돼 있어야 합니다.
- **macOS Gatekeeper**: 산출 바이너리는 서명/노터라이즈되어 있지 않습니다. macOS 호스트에서는 "확인되지 않은
  개발자" 차단이 뜰 수 있습니다. 필요 시 codesign/notarization 단계를 별도로 추가하세요.
- **zoekt on Windows**: 업스트림 zoekt는 Windows를 컴파일조차 못 합니다(index mmap·`unix.Umask`가 Unix 전용).
  미머지 [PR #941](https://github.com/sourcegraph/zoekt/pull/941)을 벤더 소스(`third_party/zoekt`)에 적용해
  빌드는 통과하나, **런타임 정상 동작은 실제 Windows 호스트에서 미검증**입니다.
- **크로스컴파일된 zoekt 바이너리는 빌드 시점 스모크 테스트가 없습니다**(빌드 러너가 Linux이므로). 각 타깃 호스트에서
  최초 1회 실행 확인을 권장합니다.

## 산출물

플랫폼별로 zoekt 3종 + `universal-ctags`(Windows는 `.exe`)가 하나의 아카이브에 묶입니다.

- Unix: `zoekt-ctags-<os>-<arch>.tar.gz`
- Windows: `zoekt-ctags-<os>-<arch>.zip`
