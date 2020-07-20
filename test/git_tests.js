/*
 * Copyright 2018 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env mocha */

const assert = require('assert');
const path = require('path');
const { promisify } = require('util');

const shell = require('shelljs');
const fse = require('fs-extra');
const tmp = require('tmp');

const {
  currentBranch,
  getRawContent,
  resolveCommit,
} = require('../lib/git.js');

const TEST_DIR_DEFAULT = path.resolve(__dirname, 'integration/default');

if (!shell.which('git')) {
  shell.echo('Sorry, this tests requires git');
  shell.exit(1);
}

const mkTmpDir = promisify(tmp.dir);

async function initRepository(dir) {
  const pwd = shell.pwd();
  shell.cd(dir);
  shell.exec('git init');
  // workaround for --initial-branch=main (supported as of git v.2.28.0)
  shell.exec('git symbolic-ref HEAD refs/heads/main');
  shell.exec('mkdir sub');
  shell.exec(`mkdir ${path.join('sub', 'sub')}`);
  shell.touch(path.join('sub', 'sub', 'some_file.txt'));
  shell.exec('git add -A');
  shell.exec('git commit -m"initial commit."');

  // setup 'new_branch'
  shell.exec('git checkout -b new_branch');
  shell.touch('new_file.txt');
  shell.exec('git add .');
  shell.exec('git commit -m "new_branch commit"');

  // setup 'branch/with_slash'
  shell.exec('git checkout -b branch/with_slash');
  shell.touch('another_new_file.txt');
  shell.exec('git add .');
  shell.exec('git commit -m "new_branch commit"');

  // setup 'config' branch
  shell.exec('git checkout main');
  shell.exec('git checkout -b config');
  shell.touch('config_file.txt');
  shell.exec('git add .');
  shell.exec('git commit -m "new_branch commit"');

  shell.exec('git checkout main');
  shell.cd(pwd);
}

describe('Testing git.js', function suite() {
  this.timeout(10000);

  let testRepoRoot;
  let repoDir;

  before(async () => {
    // copy default repos to tmp dir and setup git repos
    testRepoRoot = await mkTmpDir();
    await fse.copy(TEST_DIR_DEFAULT, testRepoRoot);
    repoDir = path.resolve(testRepoRoot, 'owner1/repo1');
    await initRepository(repoDir);
  });

  after(() => {
    // cleanup: remove tmp repo root
    // Note: the async variant of remove hangs for some reason on windows
    fse.removeSync(testRepoRoot);
  });

  it('currentBranch', async () => {
    const branch = await currentBranch(repoDir);
    assert.strictEqual(branch, 'main');
  });

  it('resolveCommit', async () => {
    const commitSha = await resolveCommit(repoDir, 'main');
    let sha = await resolveCommit(repoDir, commitSha);
    assert.strictEqual(commitSha, sha);
    sha = await resolveCommit(repoDir, commitSha.substr(0, 7));
    assert.strictEqual(commitSha, sha);
  });

  it('getRawContent', async () => {
    const content = await getRawContent(repoDir, 'main', 'README.md', false);
    assert(content.length);
  });
});
