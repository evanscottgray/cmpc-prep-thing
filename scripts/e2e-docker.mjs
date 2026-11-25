#!/usr/bin/env node
// Builds (without zipping) and runs the WebKit E2E suite inside the Playwright Docker image.
import { execSync } from 'node:child_process';
const extra = process.argv.slice(2).join(' ');
execSync('npm run build:nozip', { stdio: 'inherit' });
// The previous release's committed build, for the upgrade test (tests/e2e/upgrade.spec.ts).
const here = new Set(execSync('git tag --points-at HEAD').toString().split('\n').filter(Boolean));
const prev = execSync('git tag --sort=-v:refname').toString().split('\n').find((t) => t && !here.has(t));
if (prev) {
  execSync('rm -rf .work/upgrade/old && mkdir -p .work/upgrade/old');
  execSync(`git archive ${prev} dist | tar -x -C .work/upgrade/old --strip-components=1`);
  console.log(`upgrade test: previous release ${prev}`);
}
execSync(`scripts/pw-docker.sh npx playwright test ${extra}`, { stdio: 'inherit' });
