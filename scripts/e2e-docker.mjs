#!/usr/bin/env node
// Builds (without zipping) and runs the WebKit E2E suite inside the Playwright Docker image.
import { execSync } from 'node:child_process';
const extra = process.argv.slice(2).join(' ');
execSync('npm run build:nozip', { stdio: 'inherit' });
// The previous release's build, for the upgrade test (tests/e2e/upgrade.spec.ts). Required.
const FROM = 'v1.4.0';
execSync('rm -rf .work/upgrade/old && mkdir -p .work/upgrade/old');
execSync(`git archive ${FROM} dist | tar -x -C .work/upgrade/old --strip-components=1`); // throws if the tag is missing (fetch tags first)
console.log(`upgrade test: from ${FROM}`);
execSync(`scripts/pw-docker.sh npx playwright test ${extra}`, { stdio: 'inherit' });
