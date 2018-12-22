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
 * Determines whether modified, i.e. uncommitted content should be delivered (issue #187).
 *
 * @param {string} dir git repo path
 * @param {string} ref requested reference (branch or tag)
 * @returns {Promise<boolean>} `true` if modified file should be served instead of committed file
 */
async function serveModifiedContent(dir, ref) {
  // serve modified content only if currently checked out and requested refs match
  const oidCurrent = await git.resolveRef({ dir, ref: 'HEAD' });
  const oidRequested = await git.resolveRef({ dir, ref });
  return oidCurrent === oidRequested;
}

/**
 * Returns the blob oid of the file at revision `ref` and `pathName`
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @param {string} filePath relative path to file
 * @returns {Promise<string>} blob oid of specified file
 * @throws {GitError} `err.code === 'TreeOrBlobNotFoundError'`: resource not found
 */
async function resolveBlob(dir, ref, pathName) {
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

  if (!await serveModifiedContent(dir, ref)) {
    return (await git.readObject({
      dir,
      oid: commitSha,
      filepath: pathName,
      format: 'content',
    })).oid;
  }

  const status = await git.staus({ dir, filepath: pathName });
  if (status.endsWith('unmodified')) {
    return (await git.readObject({
      dir,
      oid: commitSha,
      filepath: pathName,
      format: 'content',
    })).id;
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
 * @returns {Promise<Buffer>} content of specified file
 * @throws {GitError} `err.code === 'TreeOrBlobNotFoundError'`: resource not found
 */
async function getRawContent(dir, ref, pathName) {
  return resolveBlob(dir, ref, pathName)
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
  serveModifiedContent,
  createBlobReadStream,
};
