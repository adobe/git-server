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
const zlib = require('zlib');
const { Transform } = require('stream');

const fse = require('fs-extra');
const mime = require('mime');
const Git = require('nodegit');

const { resolveRepositoryPath } = require('./utils');

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
    if (!this.skipped) {
      // read past blob header '
      const off = chunk.indexOf(0);
      if (off === -1) {
        return cb();
      }
      this.skipped = true;
      return cb(null, chunk.slice(off + 1));
    }
    return cb(null, chunk);
  }
}

/* eslint no-unused-vars: "off" */
function calculateBlobSha1(data) {
  return crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
}

/**
 * Determines whether dirty, i.e. uncommitted content should be delivered.
 *
 * @param {Git.Reference} headRef HEAD reference (currently checked out branch or tag)
 * @param {Git.Reference} reqRef requested reference (branch or tag)
 */
function serveUncommittedContent(headRef, reqRef) {
  // serve dirty content only if currently checked out and requested refs match
  return !headRef.cmp(reqRef);
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
    .catch(_ => null);
  const localBlob = await Git.Blob.createFromWorkdir(repo, filePath)
    .then(oid => Git.Blob.lookup(repo, oid))
    .catch(_ => null);

  // issue #150: check for uncommitted local changes
  // issue #183: serve newly created uncommitted files
  // issue #187: only serve uncommitted content if currently
  //             checked-out and requested refs match
  if (blob && localBlob) {
    if (serveUncommitted && !localBlob.id().equal(blob.id())) {
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
 * Export the raw content handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @returns {function(*, *, *)} handler function
 */
function createMiddleware(options) {
  /**
   * Express middleware handling raw content requests
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   */
  return (req, res, next) => {
    const { owner } = req.params;
    const repoName = req.params.repo;
    const refName = req.params.ref;
    const fpath = req.params[0];

    // TODO: handle branch names containing '/' (e.g. 'foo/bar')

    const repPath = resolveRepositoryPath(options, owner, repoName);

    let repo;
    let serveUncommitted = false;
    let headRef;
    Git.Repository.open(repPath)
      .then((repository) => {
        repo = repository;
        return repo.head()
          .then((ref) => {
            headRef = ref;
            return repo.getReference(refName);
          })
          .then((reqRef) => {
            serveUncommitted = serveUncommittedContent(headRef, reqRef);
            return reqRef.peel(Git.Object.TYPE.COMMIT);
          })
          .then(obj => Git.Commit.lookup(repo, obj.id()))
          .catch(() => {
            /* eslint arrow-body-style: "off" */

            // ref => commit id?
            // return repo.getCommit(ref);
            // support shorthand commit id's
            return Git.AnnotatedCommit.fromRevspec(repo, refName)
              .then(annCommit => repo.getCommit(annCommit.id()));
          });
      })
      .then(commit => resolveBlobFromCommit(repo, commit, fpath, serveUncommitted))
      .then((blob) => {
        const mimeType = mime.getType(fpath) || 'text/plain';
        const sha1 = blob.id().tostrS();
        res.writeHead(200, {
          'Content-Type': mimeType,
          ETag: sha1,
          // TODO: review cache-control header
          'Cache-Control': 'max-age=0, private, must-revalidate',
        });
        const blobPath = path.join(repPath, '.git/objects', sha1.substr(0, 2), sha1.substr(2));
        fse.exists(blobPath)
          .then((exists) => {
            if (exists) {
              // stream blob content directly from git's loose object store on file system
              fse.createReadStream(blobPath)
                .pipe(zlib.createInflate())
                .pipe(new SkipBlobHeader())
                .pipe(res);
            } else {
              // fallback: refs are probably packed, let nodegit handle/resolve packed-refs
              res.end(blob.isBinary() ? blob.content() : blob.toString());
            }
          });
      })
      .catch((err) => {
        // TODO: return specific status (404, 500, etc)?
        next(err);
      })
      .finally(() => {
        // TODO: cache Repository instances (key: absolute path)
        repo.free();
      });
  };
}
module.exports = createMiddleware;
