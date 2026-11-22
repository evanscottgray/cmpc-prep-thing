#!/usr/bin/env node
// Builds (without zipping) and runs the WebKit E2E suite inside the Playwright Docker image.
import { execSync } from 'node:child_process';
const extra = process.argv.slice(2).join(' ');
execSync('npm run build:nozip', { stdio: 'inherit' });
execSync(`scripts/pw-docker.sh npx playwright test ${extra}`, { stdio: 'inherit' });
