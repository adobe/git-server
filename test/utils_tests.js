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

const path = require('path');

const assert = require('assert');

const {
  pathExists,
  resolveRepositoryPath,
} = require('../lib/utils');

describe('Testing utils.js', () => {
  it('case-sensitive path existence', async () => {
    const { dir, base } = path.parse(__filename);
    assert.ok(await pathExists(dir, base));
    assert.ok(!await pathExists(dir, base.toUpperCase()));
  });

  it('resolveRepositoryPath sanitizes owner and repo name', async () => {
    const repoRoot = path.resolve('.');
    const options = { repoRoot, virtualRepos: {} };
    let p = resolveRepositoryPath(options, 'owner', 'repo');
    assert.ok(p.startsWith(repoRoot));
    p = resolveRepositoryPath(options, '../..', '.');
    assert.ok(p.startsWith(repoRoot));
    p = resolveRepositoryPath(options, 'foo/..', 'bar/.');
    assert.ok(p.startsWith(repoRoot));
  });
});
