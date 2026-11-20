#!/usr/bin/env node
// Kiro_Guard: checks the submission rules for LICENSE, .gitignore, the /.kiro
// directory and the root commit date (Requirements 27 and 28).
// Run with `npm.cmd run check:kiro`. Uses only Node built-ins.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The first commit must be dated after this day (27.1), in the committer's calendar date.
const DATE_CUTOFF_EXCLUSIVE = '2026-10-30';

const SPEC_FILES = [
  '.kiro/specs/spooky-break-reminder/requirements.md',
  '.kiro/specs/spooky-break-reminder/design.md',
  '.kiro/specs/spooky-break-reminder/tasks.md',
];
const STEERING_DIR = '.kiro/steering/';
const HOOK_DIR = '.kiro/hooks/';

// Each Agent_Hook is found by the npm script it runs (28.3-28.5).
const REQUIRED_HOOKS = [
  { requirement: '28.3', script: 'test', purpose: 'runs the Test_Suite on source save' },
  { requirement: '28.4', script: 'check:i18n', purpose: 'runs the translation parity check on locale save' },
  { requirement: '28.5', script: 'check:kiro', purpose: 'runs the Kiro_Guard on .gitignore save' },
];

// Paths that must not be ignored even though they do not exist yet (27.4, 27.5).
const PROBE_PATHS = [
  '.kiro/specs/_probe/requirements.md',
  '.kiro/steering/_probe.md',
  '.kiro/hooks/_probe.json',
  '.kiro/hooks/_probe.kiro.hook',
  '.kiro/settings/_probe.json',
];

function git(root, args, input) {
  const r = spawnSync('git', args, { cwd: root, input, encoding: 'utf8', windowsHide: true });
  if (r.error) {
    return { ok: false, status: null, stdout: '', stderr: r.error.message };
  }
  return { ok: r.status === 0, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function lines(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line !== '');
}

// Lists every file and directory under .kiro on disk, using forward slashes (27.4).
function walkKiro(root) {
  const base = join(root, '.kiro');
  if (!existsSync(base) || !statSync(base).isDirectory()) {
    return [];
  }
  const found = [];
  const visit = (absDir, relDir) => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      found.push(rel);
      if (entry.isDirectory()) {
        visit(join(absDir, entry.name), rel);
      }
    }
  };
  visit(base, '.kiro');
  return found;
}

function checkLicense(root, failures) {
  const path = join(root, 'LICENSE');
  if (!existsSync(path)) {
    failures.push('LICENSE is missing from the repository root (27.2, 27.7)');
    return;
  }
  const text = readFileSync(path, 'utf8');
  if (!text.includes('MIT License')) {
    failures.push('LICENSE does not contain the text "MIT License" (27.2)');
  }
  if (!/\b2026\b/.test(text)) {
    failures.push('LICENSE does not contain the year 2026 (27.2)');
  }
  const holderLine = /^Copyright \(c\) 2026 (\S.*)$/m.exec(text);
  if (!holderLine) {
    failures.push('LICENSE has no line "Copyright (c) 2026 <holder>" (27.2)');
  } else if (/<holder>/.test(holderLine[1])) {
    failures.push('LICENSE still has the placeholder <holder> in its copyright line (27.2)');
  }
}

function checkGitignoreExists(root, failures) {
  if (!existsSync(join(root, '.gitignore'))) {
    failures.push('.gitignore is missing from the repository root (27.4)');
  }
}

function checkIgnoredKiroPaths(root, failures) {
  const candidates = [...new Set([...walkKiro(root), ...PROBE_PATHS])];
  const listed = git(root, ['check-ignore', '--no-index', '--stdin'], `${candidates.join('\n')}\n`);
  if (listed.status !== 0 && listed.status !== 1) {
    failures.push(`git check-ignore failed, so ignored paths under .kiro could not be checked: ${listed.stderr.trim()}`);
    return;
  }
  const ignored = [...new Set(lines(listed.stdout))];
  if (ignored.length === 0) {
    return;
  }

  // -v prints "source:line:pattern<TAB>path" for each ignored path.
  const details = git(root, ['check-ignore', '--no-index', '-v', '--stdin'], `${ignored.join('\n')}\n`);
  const matchFor = new Map();
  for (const line of lines(details.stdout)) {
    const m = /^(.*):(\d+):(.*)\t(.*)$/.exec(line);
    if (m) {
      matchFor.set(m[4], `${m[1]}:${m[2]}:${m[3]}`);
    }
  }
  for (const path of ignored) {
    const match = matchFor.get(path) ?? 'unknown pattern';
    failures.push(`${path} is ignored and must not be (matched by ${match}) (27.4, 27.5)`);
  }
}

function checkTrackedKiro(tracked, failures) {
  if (!tracked.some((path) => path.startsWith('.kiro/'))) {
    failures.push('No file under .kiro is tracked by git (git ls-files -- .kiro is empty) (27.6)');
  }
}

function checkRequiredArtifacts(root, tracked, failures) {
  const trackedSet = new Set(tracked);

  for (const rel of SPEC_FILES) {
    if (!trackedSet.has(rel)) {
      failures.push(`${rel} is not tracked by git (27.3, 28.1)`);
    } else if (!existsSync(join(root, rel))) {
      failures.push(`${rel} is tracked but missing from disk (28.1)`);
    }
  }

  const steering = tracked.filter((path) => path.startsWith(STEERING_DIR));
  if (steering.length === 0) {
    failures.push(`No Steering_Document is tracked under ${STEERING_DIR} (28.2)`);
  }

  const hookFiles = tracked.filter((path) => path.startsWith(HOOK_DIR));
  for (const hook of REQUIRED_HOOKS) {
    const commandPattern = new RegExp(
      `\\b(?:npm|npx)(?:\\.cmd)?\\s+run\\s+${hook.script}(?![\\w:.-])`,
    );
    const matches = hookFiles.filter((rel) => {
      const abs = join(root, rel);
      return existsSync(abs) && commandPattern.test(readFileSync(abs, 'utf8'));
    });
    if (matches.length === 0) {
      failures.push(
        `No tracked hook under ${HOOK_DIR} runs "npm.cmd run ${hook.script}" (${hook.purpose}) (${hook.requirement})`,
      );
    }
  }
}

function checkRootCommit(root, failures, notes) {
  const shallow = git(root, ['rev-parse', '--is-shallow-repository']);
  if (shallow.stdout.trim() === 'true') {
    notes.push('Shallow clone: skipped the root commit date check (27.1). Use fetch-depth: 0 to run it.');
    return;
  }

  const head = git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (!head.ok) {
    failures.push(`Repository has no commit yet; the root commit must be dated after ${DATE_CUTOFF_EXCLUSIVE} (27.1)`);
    return;
  }

  const roots = lines(git(root, ['rev-list', '--max-parents=0', 'HEAD']).stdout);
  const dates = roots
    .map((sha) => git(root, ['show', '-s', '--format=%cI', sha]).stdout.trim())
    .filter((date) => date !== '')
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  if (dates.length === 0) {
    failures.push('Could not read the root commit date (27.1)');
    return;
  }
  const earliest = dates[0];
  if (earliest.slice(0, 10) <= DATE_CUTOFF_EXCLUSIVE) {
    failures.push(`Root commit is dated ${earliest}, which is not after ${DATE_CUTOFF_EXCLUSIVE} (27.1)`);
  }
}

/**
 * Runs every Kiro_Guard check against the repository at `root`.
 * Returns the failed conditions, warnings and notes without printing or exiting.
 */
export function runKiroGuard(root = REPO_ROOT) {
  const failures = [];
  const warnings = [];
  const notes = [];

  checkLicense(root, failures);
  checkGitignoreExists(root, failures);

  if (!existsSync(join(root, '.git'))) {
    failures.push(`${root} is not a git repository (no .git entry), so the git checks cannot run`);
    return { failures, warnings, notes };
  }

  const inside = git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    failures.push(`git cannot read the repository at ${root}: ${inside.stderr.trim() || 'unknown error'}`);
    return { failures, warnings, notes };
  }

  const tracked = lines(git(root, ['ls-files']).stdout);
  const untracked = lines(git(root, ['ls-files', '--others', '--exclude-standard', '--', '.kiro']).stdout);
  if (untracked.length > 0) {
    warnings.push(`Untracked files under .kiro (commit them before the pipeline runs): ${untracked.join(', ')} (27.3)`);
  }

  checkIgnoredKiroPaths(root, failures);
  checkTrackedKiro(tracked, failures);
  checkRequiredArtifacts(root, tracked, failures);
  checkRootCommit(root, failures, notes);

  return { failures, warnings, notes };
}

function main() {
  const { failures, warnings, notes } = runKiroGuard(REPO_ROOT);

  for (const note of notes) console.log(`NOTE  ${note}`);
  for (const warning of warnings) console.log(`WARN  ${warning}`);
  for (const failure of failures) console.error(`FAIL  ${failure}`);

  if (failures.length > 0) {
    console.error(`Kiro_Guard failed: ${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log('Kiro_Guard passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
