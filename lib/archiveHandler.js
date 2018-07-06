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
const zlib = require('zlib');

const fse = require('fs-extra');
const Git = require('nodegit');

const { resolveRepositoryPath, resolveBlobFromCommit, SkipBlobHeader } = require('./utils');

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
 * Export the raw content handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @param {string} archiveFormat 'zip' or 'tar.gz'
 * @returns {function(*, *, *)} handler function
 */
function createMiddleware(options, archiveFormat) {
  /**
   * Express middleware handling GitHub 'codeload' archive requests
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/repos/contents/#get-archive-link
   */
  return (req, res, next) => {
    // GET /:owner/:repo/:archive_format/:ref
    const { owner } = req.params;
    const repoName = req.params.repo;
    const refName = req.params.ref;
   
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
      .then(commit => commit.getTree())
      .then((tree) => {
        // TODO: implement
        next(new Error('not yet implemented'));
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
