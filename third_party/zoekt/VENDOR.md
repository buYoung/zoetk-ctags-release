# Vendored zoekt

이 디렉터리는 [sourcegraph/zoekt](https://github.com/sourcegraph/zoekt) 소스를 이 저장소에
**직접 벤더링(복사)** 한 것입니다. 빌드는 업스트림을 fetch하지 않고 이 트리에서 직접 합니다.

zoekt를 벤더링하는 이유:
- zoekt는 semver 릴리스/태그가 없고 커밋 SHA(pseudo-version)만 있어, 안정적으로 고정하려면 직접 보관이 안전함.
- Windows 지원이 **미머지 PR**에만 있어(아래), 업스트림 브랜치는 force-push·삭제될 수 있음. 패치를 직접 보관해야 재현 가능.

## 출처(provenance)

| 항목 | 값 |
|------|-----|
| upstream | github.com/sourcegraph/zoekt |
| base 커밋 | `3b6cf8a969d7a81e9d04d3bb7de1da8f57e1178c` (2026-05-27) |
| 적용 패치 | `../../patches/zoekt-windows-pr941.patch` |

패치 내용 = [PR #941 "all: re-implement Windows support"](https://github.com/sourcegraph/zoekt/pull/941) (커밋 `36f974a`)를 base 커밋 위에 적용 + 아래 보정.

### base 위에서 직접 해결한 두 지점 (PR이 1년 전 base 기준이라 발생)

1. `index/indexfile.go` 빌드 태그 충돌 → base의 `//go:build linux || darwin || freebsd` 유지(Windows는 새 `indexfile_windows.go`가 담당).
2. `cmd/zoekt-webserver/metrics_linux.go` 복원 → PR이 `metrics.go`를 삭제했으나 base에는 그 후 추가된 linux 전용 `mustRegisterMemoryMapMetrics`(procfs 기반)가 있었음. 파일명 접미사 `_linux.go`로 linux 전용 빌드되게 복원. 그 외 플랫폼은 PR의 `metrics_nonlinux.go`(`//go:build !linux`) 스텁이 담당.

검증: 벤더 트리에서 6개 타깃(linux/macos/windows × amd64/arm64) 모두 `go build` 통과 확인.

## 업데이트 절차 (업스트림 zoekt를 새 SHA로 올릴 때)

벤더링은 "한 번 복사하고 끝"이 아니라, 업스트림 변경 반영 시 아래를 반복합니다. Windows 패치는
업스트림이 건드리는 파일과 겹치면 충돌할 수 있으므로(위 2지점이 그 예), 매 업데이트마다 재해결이 필요할 수 있습니다.

```sh
NEW_SHA=<새 zoekt 커밋 SHA>
git clone https://github.com/sourcegraph/zoekt /tmp/z && cd /tmp/z
git checkout "$NEW_SHA"
# 보관해 둔 우리 divergence 적용 (충돌 시 수동 재해결)
git apply --3way /path/to/this-repo/patches/zoekt-windows-pr941.patch

# 6개 타깃 빌드 검증 (실패하면 충돌/누락 재해결)
for t in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do
  GOOS=${t%/*} GOARCH=${t#*/} CGO_ENABLED=0 go build ./cmd/zoekt-webserver || echo "FAIL $t"
done

# 통과하면 이 디렉터리로 복사(.git 제외)하고, 패치를 새 base 기준으로 재생성
rsync -a --exclude='.git' /tmp/z/ /path/to/this-repo/third_party/zoekt/
# VENDOR.md의 base 커밋/날짜 갱신, patches/*.patch 도 git diff 로 재생성
```

> PR #941이 업스트림에 **머지되면** 이 패치는 불필요해지고, 그때는 새 base SHA만 벤더링하면 됩니다.
> 머지 여부는 https://github.com/sourcegraph/zoekt/pull/941 에서 확인.
