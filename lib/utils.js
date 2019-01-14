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

'use strict';

const crypto = require('crypto');
const path = require('path');

/**
 * Calculates the id (sha1) of a Git Blob.
 *
 * @param {string|Buffer} data blob data
 */
function calculateBlobSha1(data) {
  return crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
}

/**
 * Generates a random name.
 *
 * @param {Number} len
 */
function randomFileOrFolderName(len = 32) {
  if (Number.isFinite(len)) {
    return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
  }
  throw new Error(`illegal argument: ${len}`);
}

/**
 * Resolves the file system path of the specified repository.
 *
 * @param {object} options configuration hash
 * @param {string} owner github org or user
 * @param {string} repo repository name
 */
function resolveRepositoryPath(options, owner, repo) {
  let repPath = path.resolve(options.repoRoot, owner, repo);

  if (options.virtualRepos[owner] && options.virtualRepos[owner][repo]) {
    repPath = path.resolve(options.virtualRepos[owner][repo].path);
  }
  return repPath;
}

module.exports = {
  resolveRepositoryPath,
  calculateBlobSha1,
  randomFileOrFolderName,
};
