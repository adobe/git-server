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

const git = require('isomorphic-git');

git.plugins.set('fs', require('fs'));

/**
 * Various helper functions reading git content
 */

/**
 * Returns the contents of the file at revision `ref` and `pathName`
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @param {string} filePath relative path to file
 * @returns {Promise<Buffer>} content of specified file
 * @throws {GitError} `err.code === 'TreeOrBlobNotFoundError'`: resource not found
 */
async function getRawContent(dir, ref, pathName) {
  let commitSha;
  try {
    commitSha = await git.resolveRef({ dir, ref });
  } catch (err) {
    if (err.code === 'ResolveRefError') {
      // fallback: is ref a shortened oid prefix?
      const oid = await git.expandOid({ dir, oid: ref });
      commitSha = await git.resolveRef({ dir, ref: oid });
    } else {
      throw err;
    }
  }
  const content = await git.readObject({
    dir,
    oid: commitSha,
    filepath: pathName,
    format: 'content',
  });
  return content.object;
}

module.exports = {
  getRawContent,
};
