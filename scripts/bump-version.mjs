import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const versionJsonPath = path.join(root, 'public', 'version.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version || '0.1.0';
const [major, minor, patch] = currentVersion.split('.').map((n) => Number.parseInt(n, 10) || 0);

function getLastCommitMessage() {
  try {
    return execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function getCommitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const explicitBump = (process.env.BUMP_TYPE || '').toLowerCase();
const commitMessage = getLastCommitMessage();

let bumpType = explicitBump;
if (!['major', 'minor', 'patch'].includes(bumpType)) {
  if (/BREAKING CHANGE|^[a-z]+(\([^)]+\))?!:/m.test(commitMessage)) {
    bumpType = 'major';
  } else if (/^feat(\([^)]+\))?:/m.test(commitMessage)) {
    bumpType = 'minor';
  } else {
    bumpType = 'patch';
  }
}

let nextVersion = currentVersion;
if (bumpType === 'major') {
  nextVersion = `${major + 1}.0.0`;
} else if (bumpType === 'minor') {
  nextVersion = `${major}.${minor + 1}.0`;
} else {
  nextVersion = `${major}.${minor}.${patch + 1}`;
}

pkg.version = nextVersion;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

const repository = process.env.GITHUB_REPOSITORY || '';
const releaseUrl = repository
  ? `https://github.com/${repository}/releases/tag/v${nextVersion}`
  : '';
const summaryLine = commitMessage.split('\n')[0] || `Release v${nextVersion}`;

const versionManifest = {
  version: nextVersion,
  releasedAt: new Date().toISOString(),
  commitSha: getCommitSha(),
  repository,
  releaseUrl,
  notes: summaryLine,
};

fs.mkdirSync(path.dirname(versionJsonPath), { recursive: true });
fs.writeFileSync(
  versionJsonPath,
  `${JSON.stringify(versionManifest, null, 2)}\n`,
  'utf8',
);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${nextVersion}\ntag=v${nextVersion}\nbump=${bumpType}\n`,
    'utf8',
  );
}

console.log(`Bumped version: ${currentVersion} -> ${nextVersion} (${bumpType})`);
