# Third-Party Notices

이 저장소 **자체**(워크플로·문서·패치·스크립트)는 [Apache-2.0](LICENSE)입니다.

그러나 이 저장소가 빌드해 **릴리스로 배포하는 바이너리**에는 다른 라이선스의 제3자 프로그램이 포함됩니다.
각 바이너리는 아래 원 프로젝트의 라이선스를 따릅니다.

## 번들 구성요소

| 구성요소 | 버전(핀) | 라이선스 | 형태 |
|----------|----------|----------|------|
| [zoekt](https://github.com/sourcegraph/zoekt) | `third_party/zoekt` 벤더링 (base `3b6cf8a` + PR #941) | **Apache-2.0** | 별도 실행 파일 |
| [universal-ctags](https://github.com/universal-ctags/ctags) | `v6.1.0` | **GPL-2.0-or-later** | 별도 실행 파일(`universal-ctags`) |
| [jansson](https://github.com/akheron/jansson) | `2.15.0` | MIT | universal-ctags에 **정적 링크** |
| [GNU libiconv](https://www.gnu.org/software/libiconv/) | `1.17` | LGPL-2.1-or-later | universal-ctags(Windows 등)에 **정적 링크** |

## 카피레프트(GPL/LGPL) 고지 — 중요

`universal-ctags` 바이너리는 **GPL-2.0-or-later**이며, 그 안에 LGPL-2.1+ libiconv가 정적 링크됩니다.
GPLv2 §3 / LGPL은 **바이너리 배포 시 대응 소스 제공**을 요구합니다.

이를 충족하기 위해, 각 GitHub Release에는 빌드에 사용된 **정확한 비수정(unmodified) 업스트림 소스
tarball**(ctags `v6.1.0`, jansson `2.15.0`, libiconv `1.17`)을 함께 첨부합니다. 원본은 다음에서도 받을 수 있습니다.

- ctags: <https://github.com/universal-ctags/ctags/releases/tag/v6.1.0>
- jansson: <https://github.com/akheron/jansson/releases/tag/v2.15.0>
- libiconv: <https://ftp.gnu.org/gnu/libiconv/libiconv-1.17.tar.gz>

이 저장소는 위 소스를 **수정 없이** 빌드합니다(빌드 플래그만 지정). 패치를 가하는 유일한 구성요소는 zoekt이며,
그 변경 내역은 [`patches/`](patches/)와 [`third_party/zoekt/VENDOR.md`](third_party/zoekt/VENDOR.md)에 기록되어 있습니다.

## 라이선스 관계(왜 저장소가 Apache-2.0일 수 있는가)

`zoekt`와 `universal-ctags`는 **서로 독립된 별도 프로그램**입니다. zoekt는 ctags를 라이브러리로 링크하지 않고
**서브프로세스로 실행**(JSON/interactive 프로토콜)합니다. 하나의 아카이브에 함께 담기는 것은 GPL에서 말하는
"단순 통합(mere aggregation)"에 해당하며, 이로 인해 zoekt(Apache-2.0)가 GPL로 전염되지 않습니다.
저장소 자체 파일도 ctags 소스를 포함하지 않으므로 Apache-2.0로 유지됩니다.

배포된 `universal-ctags` 바이너리 그 자체는 GPL-2.0-or-later 조건으로 배포·재배포됩니다.
