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
const { Transform } = require('stream');

const Git = require('nodegit');

/**
 * Transform stream skipping blob header 'blob <length>\0'
 */
/* eslint no-underscore-dangle: ["error", { "allow": ["_skipped", "_transform"] }] */
class SkipBlobHeader extends Transform {
  constructor(options) {
    super(options);
    this._skipped = false;
  }

  _transform(chunk, encoding, cb) {
    if (!this._skipped) {
      // read past blob header '
      const off = chunk.indexOf(0);
      if (off === -1) {
        return cb();
      }
      this._skipped = true;
      return cb(null, chunk.slice(off + 1));
    }
    return cb(null, chunk);
  }
}

/**
 * Calculates the id (sha1) of a Git Blob.
 *
 * @param {string|Buffer} data blob data
 */
function calculateBlobSha1(data) {
  return crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
}

/**
 * Returns a blob resolved either from the specified commit or an uncommitted local file.
 *
 * @param {Git.Repository} repo Repository instance
 * @param {Git.Commit} commit Commit instance
 * @param {string} filePath path of file relative to the repository root
 * @param {boolean} serveUncommitted true if uncommitted changes should be returned, otherwise false
 * @returns {Promise} the resolved Blob instance
 */
async function resolveBlobFromCommit(repo, commit, filePath, serveUncommitted) {
  const blob = await commit.getEntry(filePath)
    .then(entry => entry.getBlob())
    .catch(() => null);
  const localBlob = serveUncommitted ? await Git.Blob.createFromWorkdir(repo, filePath)
    .then(oid => Git.Blob.lookup(repo, oid))
    .catch(() => null) : null;

  // issue #150: check for uncommitted local changes
  // issue #183: serve newly created uncommitted files
  // issue #187: only serve uncommitted content if currently
  //             checked-out and requested refs match
  if (blob && localBlob) {
    if (!localBlob.id().equal(blob.id())) {
      // serve local file
      return localBlob;
    }
    return blob;
  } else if (!blob && !localBlob) {
    return Promise.reject(new Error(`file not found: ${filePath}`));
  }
  return Promise.resolve(blob || localBlob);
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
  resolveBlobFromCommit,
  calculateBlobSha1,
  SkipBlobHeader,
};
