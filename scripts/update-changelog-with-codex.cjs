#!/usr/bin/env node

/**
 * codex로 CHANGELOG.md의 "## [Unreleased]" 섹션을 사용자 관점(영문)으로 갱신합니다.
 *
 * 이 스크립트는 단독으로 쓰지 않고, release-it의 before:init hook에서 실행됩니다(.release-it.json).
 * 반자동화 통제형 흐름(`pnpm release` 한 번):
 *   1) before:init  -> 이 스크립트가 codex로 [Unreleased]에 사용자향 항목 작성
 *   2) (대화형) 버전 선택 -> release-it이 changelog 미리보기 표시
 *   3) (대화형) 커밋 프롬프트에서 사용자가 yes -> keep-a-changelog가 [Unreleased] -> [X.Y.Z] 변환 후 커밋
 *   4) (대화형) 태그/푸시 프롬프트
 *
 * - 버전 bump/태그/푸시는 release-it이 담당하므로 이 스크립트는 버전 파일을 건드리지 않습니다.
 * - [Unreleased] -> [X.Y.Z] 변환도 release-it의 @release-it/keep-a-changelog가 수행합니다.
 *   (그래서 codex는 버전 무관 섹션에만 쓰고, 버전 섹션을 직접 만들지 않습니다.)
 * - [Unreleased]에 이미 사람이 쓴 항목이 있으면 codex를 건너뜁니다(사람 작성 항목 보호).
 *   codex가 커밋 메타데이터만으로는 추론하지 못하는 변경(예: 빠졌던 플랫폼을 복구하는
 *   CI 전용 수정)은 직접 작성해 두면 그대로 릴리스에 사용됩니다.
 * - dry-run에서는 release-it이 before:init hook을 실행하지 않으므로 이 스크립트도 돌지 않습니다.
 *
 * 직접 실행도 가능: node scripts/update-changelog-with-codex.cjs [baseTag]
 *   baseTag 생략 시 최신 v* 태그 기준. 태그가 없으면(첫 릴리스) 전체 히스토리를 사용합니다.
 */

const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDirectory = path.resolve(__dirname, "..");
const baseTagArgument = process.argv[2] || "";

// CHANGELOG 항목 언어. 릴리스 노트는 영문으로 작성합니다.
const changelogLanguage = "English";

function runGit(argumentsList) {
  return execFileSync("git", argumentsList, {
    cwd: rootDirectory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function resolveBaseTag() {
  if (baseTagArgument) {
    return baseTagArgument;
  }

  try {
    return runGit(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"]);
  } catch {
    return ""; // 태그 없음(첫 릴리스) -> 전체 히스토리 사용
  }
}

function getCommitSummary(baseTag) {
  // 태그가 있으면 그 이후 커밋만, 없으면(첫 릴리스) 전체 히스토리. CHANGELOG.md 변경은 증거에서 제외.
  const range = baseTag ? [`${baseTag}..HEAD`] : [];
  try {
    return runGit([
      "log",
      "--no-merges",
      "--name-status",
      "--pretty=format:commit %h %s",
      ...range,
      "--",
      ".",
      ":!CHANGELOG.md",
    ]);
  } catch {
    return "";
  }
}

function getChangelogReference() {
  const changelogPath = path.join(rootDirectory, "CHANGELOG.md");
  const changelog = fs.readFileSync(changelogPath, "utf8");
  const sectionMatches = [...changelog.matchAll(/^## \[[^\]]+\].*$/gm)];

  if (sectionMatches.length === 0) {
    return changelog.slice(0, 4000);
  }

  const referenceEndIndex = sectionMatches[3]?.index ?? Math.min(changelog.length, 5000);
  return changelog.slice(0, referenceEndIndex).trim();
}

function getChangelogText() {
  return fs.readFileSync(path.join(rootDirectory, "CHANGELOG.md"), "utf8");
}

// "## [Unreleased]" 헤딩 다음부터 다음 "## [" 헤딩(또는 파일 끝) 전까지의 본문을
// 공백 제거해 돌려줍니다. 비어 있지 않으면 사람이 이미 항목을 써둔 것으로 간주합니다.
function getUnreleasedBody() {
  const changelog = getChangelogText();
  const heading = /^## \[Unreleased\][^\n]*$/im.exec(changelog);
  if (!heading) {
    return "";
  }
  const afterHeading = changelog.slice(heading.index + heading[0].length);
  const nextHeading = /^## \[/m.exec(afterHeading);
  const body = nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading;
  return body.trim();
}

function buildPrompt(baseTag, commitSummary, changelogReference) {
  const baseLabel = baseTag || "(no previous release tag — first release; consider the full history)";

  return [
    "Update only CHANGELOG.md for zoekt-ctags-release.",
    "",
    "Product context:",
    "- This repository publishes zoekt + universal-ctags as self-contained static binaries for",
    "  Linux/macOS/Windows (amd64/arm64), distributed as GitHub Releases.",
    '- A "user" here is someone who downloads these release binaries and runs/deploys them on a host',
    "  — NOT a developer of this repository.",
    "",
    "Goal:",
    "- Write a user-facing changelog entry that makes such a user immediately understand what was",
    "  added, changed, or fixed in the released binaries.",
    "- Do not describe implementation work. Explain the visible behavior, supported targets, or",
    "  deployment impact.",
    "- If there are no user-facing changes, leave CHANGELOG.md exactly unchanged.",
    "",
    "Examples of user-facing changes for this project:",
    "- A platform/architecture target becomes available or is dropped.",
    "- universal-ctags feature set changes (e.g. available parsers, +json/+interactive behavior).",
    "- A zoekt version/behavior change that affects indexing or search results.",
    "- Integrity files (.sha256 / SHA256SUMS), runtime requirements, or licensing/source-bundle",
    "  changes that a consumer relies on.",
    "",
    "Editing constraints:",
    '- Modify only the section below "## [Unreleased]".',
    "- Do not create a versioned release section (the release tooling does that).",
    "- Do not move existing release sections.",
    "- Preserve the existing Keep a Changelog style.",
    '- Use category headings such as "### Added", "### Changed", and "### Fixed" only when the commits support them.',
    "- If an existing Unreleased bullet already describes the same change, refine it instead of duplicating it.",
    "- Do not edit code, release configuration, package metadata, the workflow, or any file other than CHANGELOG.md.",
    "- Do not run tests, linting, or formatting commands.",
    "- Do not add a placeholder, summary, or note saying there are no user-facing changes.",
    "",
    "Writing rules:",
    "- Skip release automation, version bumps, dependency updates, CI/workflow changes, source",
    "  vendoring, tests, formatting, refactoring, and internal cleanup when they do not change what",
    "  binary consumers experience.",
    "- Do not include source file paths, package names, class names, function names, commit hashes,",
    "  branch names, or build/CI details.",
    '- Each bullet must answer either "what can users do now?", "what behaves differently?", or "what problem is fixed?".',
    '- Avoid vague wording such as "improved", "updated", or "fixed issues" unless the concrete user-visible result is stated.',
    "- Keep nested bullets only when one change has multiple user-visible aspects.",
    `- Write the changelog entries in ${changelogLanguage} to match the existing CHANGELOG.md.`,
    "",
    `Base release tag: ${baseLabel}`,
    "",
    "Existing changelog style reference:",
    changelogReference,
    "",
    "Commits after the base release tag:",
    "Use these commits and changed paths only as evidence. Do not copy technical file names or code identifiers into the changelog.",
    commitSummary,
    "",
  ].join("\n");
}

function restoreChangelogIfOnlyNoUserFacingNote(previousChangelog) {
  const changelogPath = path.join(rootDirectory, "CHANGELOG.md");
  const nextChangelog = fs.readFileSync(changelogPath, "utf8");
  const noChangePattern =
    /no user[- ]facing changes|no user[- ]visible changes|behaves? as before|사용자.*변경.*없|변경\s*사항.*없/i;
  const addedNoUserFacingNote =
    !noChangePattern.test(previousChangelog) && noChangePattern.test(nextChangelog);

  if (addedNoUserFacingNote) {
    fs.writeFileSync(changelogPath, previousChangelog);
    console.log("Skipped CHANGELOG.md update because no user-facing changes were found.");
  }
}

function getCodexExecHelp() {
  const result = spawnSync("codex", ["exec", "--help"], {
    cwd: rootDirectory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function buildCodexArguments() {
  const helpText = getCodexExecHelp();
  const argumentsList = ["exec", "-C", rootDirectory];

  if (helpText.includes("--sandbox")) {
    argumentsList.push("--sandbox", "workspace-write");
  }

  if (helpText.includes("--ask-for-approval")) {
    argumentsList.push("--ask-for-approval", "never");
  } else if (helpText.includes("--full-auto")) {
    argumentsList.push("--full-auto");
  }

  argumentsList.push("-");
  return argumentsList;
}

function runCodex(prompt) {
  const result = spawnSync("codex", buildCodexArguments(), {
    cwd: rootDirectory,
    input: prompt,
    stdio: ["pipe", "inherit", "inherit"],
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function listDirtyFiles() {
  return runGit(["diff", "--name-only"])
    .split("\n")
    .map((filePath) => filePath.trim())
    .filter(Boolean);
}

// 사전/사후 스냅샷을 비교해 codex가 "새로" 더럽힌 파일만 검사합니다. before:init 시점의
// 기존 변경(예: 사용자가 미리 손본 CHANGELOG.md)에는 영향받지 않습니다.
function assertCodexChangedOnlyChangelog(dirtyBefore) {
  const newlyChanged = listDirtyFiles().filter((filePath) => !dirtyBefore.has(filePath));
  const unexpectedFiles = newlyChanged.filter((filePath) => filePath !== "CHANGELOG.md");

  if (unexpectedFiles.length === 0) {
    return;
  }

  console.error("Codex changed unexpected files:");
  for (const filePath of unexpectedFiles) {
    console.error(filePath);
  }
  console.error("Only CHANGELOG.md may be changed during changelog generation.");
  process.exit(1);
}

// 사람이 이미 [Unreleased]에 항목을 작성해 둔 경우 codex를 아예 실행하지 않습니다.
// (codex가 추론할 수 없는 변경을 직접 쓴 릴리스에서, 그 항목을 codex가 건드릴 위험 제거.)
if (getUnreleasedBody()) {
  console.log('CHANGELOG.md "[Unreleased]" already has hand-written entries; skipping codex. release-it will use them as-is.');
  process.exit(0);
}

const baseTag = resolveBaseTag();
const commitSummary = getCommitSummary(baseTag);

if (!commitSummary) {
  console.log(baseTag ? `No commits found after ${baseTag}.` : "No commits found.");
  process.exit(0);
}

const dirtyBefore = new Set(listDirtyFiles());
const previousChangelog = getChangelogText();
runCodex(buildPrompt(baseTag, commitSummary, getChangelogReference()));
restoreChangelogIfOnlyNoUserFacingNote(previousChangelog);
assertCodexChangedOnlyChangelog(dirtyBefore);

console.log('\nCHANGELOG.md "[Unreleased]" updated by codex. release-it will continue; review it at the commit prompt.');
