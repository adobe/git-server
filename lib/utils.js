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
const { PassThrough, Transform } = require('stream');
const zlib = require('zlib');

const fse = require('fs-extra');
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
 * Returns a blob resolved either from the specified tree or an uncommitted local file.
 *
 * @param {Git.Repository} repo Repository instance
 * @param {Git.Tree} tree Tree instance
 * @param {string} filePath path of file relative to the repository root
 * @param {boolean} serveUncommitted true if uncommitted changes should be returned, otherwise false
 * @returns {Promise<Git.Blob>} the resolved Blob instance
 */
async function resolveBlobFromTree(repo, tree, filePath, serveUncommitted) {
  const blob = await tree.getEntry(filePath)
    .then(entry => entry.getBlob())
    .catch(() => null);
  const localBlob = serveUncommitted ? await Git.Blob.createFromWorkdir(repo, filePath)
    .then(oid => Git.Blob.lookup(repo, oid))
    .catch(() => null) : null;

  return new Promise((resolve, reject) => {
    // issue #150: check for uncommitted local changes
    // issue #183: serve newly created uncommitted files
    // issue #187: only serve uncommitted content if currently
    //             checked-out and requested refs match
    if (blob && localBlob) {
      if (!localBlob.id().equal(blob.id())) {
        // serve local file
        resolve(localBlob);
      } else {
        resolve(blob);
      }
    } else if (!blob && !localBlob) {
      const err = new Error(`file not found: ${filePath}`);
      err.errno = -3;
      reject(err);
    } else {
      resolve(blob || localBlob);
    }
  });
}

/**
 * Returns a stream for reading the specified blob.
 *
 * @param {Git.Repository} repo Repository instance
 * @param {Git.Blob} blob Blob instance
 * @returns {Promise<Stream>} readable Stream instance
 */
async function createBlobReadStream(repo, blob) {
  const sha1 = blob.id().tostrS();
  const blobPath = path.join(repo.path(), 'objects', sha1.substr(0, 2), sha1.substr(2));

  const exists = await fse.pathExists(blobPath);
  if (exists) {
    return fse.createReadStream(blobPath)
      .pipe(zlib.createInflate())
      .pipe(new SkipBlobHeader());
  }
  // fallback: refs are probably packed, let nodegit handle/resolve packed-refs
  const stream = new PassThrough();
  stream.end(blob.isBinary() ? blob.content() : blob.toString());
  return stream;
}

/**
 * Returns a stream for reading a blob resolved either from the specified tree
 * or an uncommitted local file.
 *
 * @param {Git.Repository} repo Repository instance
 * @param {Git.Tree} tree Tree instance
 * @param {string} filePath path of file relative to the repository root
 * @param {boolean} serveUncommitted true if uncommitted changes should be returned, otherwise false
 * @returns {Promise<Stream>} readable Stream instance
 */
async function resolveBlobReadStream(repo, tree, filePath, serveUncommitted) {
  const blob = await resolveBlobFromTree(repo, tree, filePath, serveUncommitted);
  return createBlobReadStream(repo, blob);
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

/**
 * Determines whether dirty, i.e. uncommitted content should be delivered (issue #187).
 *
 * @param {Git.Repository} repo Repository instance
 * @param {Git.Reference} headRef HEAD reference (currently checked out branch or tag)
 * @param {Git.Reference} reqRef requested reference (branch or tag)
 */
function serveUncommittedContent(repo, headRef, reqRef) {
  // serve dirty content only if currently checked out and requested refs match
  return !repo.isBare() && !headRef.cmp(reqRef);
}

module.exports = {
  resolveRepositoryPath,
  resolveBlobReadStream,
  createBlobReadStream,
  resolveBlobFromTree,
  calculateBlobSha1,
  randomFileOrFolderName,
  SkipBlobHeader,
  serveUncommittedContent,
};
