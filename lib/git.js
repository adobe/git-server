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

const path = require('path');
const { PassThrough } = require('stream');

const fse = require('fs-extra');
const git = require('isomorphic-git');

git.plugins.set('fs', require('fs'));

/**
 * Various helper functions for reading git meta-data and content
 */

/**
 * Determines whether the specified reference is currently checked out in the working dir.
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch or tag)
 * @returns {Promise<boolean>} `true` if the specified reference is checked out
 */
async function isCheckedOut(dir, ref) {
  const oidCurrent = await git.resolveRef({ dir, ref: 'HEAD' });
  const oid = await git.resolveRef({ dir, ref });
  return oidCurrent === oid;
}

/**
 * Returns the blob oid of the file at revision `ref` and `pathName`
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @param {string} filePath relative path to file
 * @param {boolean} includeUncommitted include uncommitted changes in working dir
 * @returns {Promise<string>} blob oid of specified file
 * @throws {GitError} `err.code === 'TreeOrBlobNotFoundError'`: resource not found
 */
async function resolveBlob(dir, ref, pathName, includeUncommitted) {
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
  // issue #150: check for uncommitted local changes
  // issue #183: serve newly created uncommitted files
  // issue #187: only serve uncommitted content if currently
  //             checked-out and requested refs match

  if (!includeUncommitted) {
    return (await git.readObject({
      dir,
      oid: commitSha,
      filepath: pathName,
      format: 'content',
    })).oid;
  }
  // check working dir status
  const status = await git.status({ dir, filepath: pathName });
  if (status.endsWith('unmodified')) {
    return (await git.readObject({
      dir,
      oid: commitSha,
      filepath: pathName,
      format: 'content',
    })).oid;
  }
  if (status.endsWith('absent') || status.endsWith('deleted')) {
    const err = new Error(`Not found: ${pathName}`);
    err.code = git.E.TreeOrBlobNotFoundError;
    throw err;
  }
  // return blob id representing working dir file
  const content = await fse.readFile(path.resolve(dir, pathName));
  return git.writeObject({
    dir,
    object: content,
    type: 'blob',
    format: 'content',
  });
}

/**
 * Returns the contents of the file at revision `ref` and `pathName`
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @param {string} filePath relative path to file
 * @param {boolean} includeUncommitted include uncommitted changes in working dir
 * @returns {Promise<Buffer>} content of specified file
 * @throws {GitError} `err.code === 'TreeOrBlobNotFoundError'`: resource not found
 */
async function getRawContent(dir, ref, pathName, includeUncommitted) {
  return resolveBlob(dir, ref, pathName, includeUncommitted)
    .then(oid => git.readObject({ dir, oid, format: 'content' }))
    .then(obj => obj.object);
}

/**
 * Returns a stream for reading the specified blob.
 *
 * @param {string} dir git repo path
 * @param {string} oid blob sha1
 * @returns {Promise<Stream>} readable Stream instance
 */
async function createBlobReadStream(dir, oid) {
  const content = await git.readObject({ dir, oid, format: 'content' });
  const stream = new PassThrough();
  stream.end(content.object);
  return stream;
}

module.exports = {
  getRawContent,
  resolveBlob,
  isCheckedOut,
  createBlobReadStream,
};
