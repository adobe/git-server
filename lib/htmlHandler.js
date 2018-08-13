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

const Git = require('nodegit');
const escape = require('escape-html');

const { resolveRepositoryPath } = require('./utils');

/**
 * Export the html handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @param {string} urlType 'root', 'tree' (directory) or 'blob' (file)
 * @returns {function(*, *, *)} handler function
 */
function createMiddleware(options, urlType) {
  /**
   * Express middleware handling html requests
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   */
  return (req, res, next) => {
    const { owner } = req.params;
    const repoName = req.params.repo;
    const refName = req.params.ref || 'master';
    let fpath = req.params[0] || '';

    // issue #247: lenient handling of redundant leading slashes in path
    while (fpath.length && fpath[0] === '/') {
      // trim leading slash
      fpath = fpath.substr(1);
    }

    // set response content type
    res.header('Content-Type', 'text/html');

    // TODO: handle branch names containing '/' (e.g. 'foo/bar')

    const repPath = resolveRepositoryPath(options, owner, repoName);

    let repo;
    Git.Repository.open(repPath)
      .then((repository) => {
        repo = repository;
        return repo.getReference(refName)
          .then(ref => ref.peel(Git.Object.TYPE.COMMIT))
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
      .then(commit => commit.getEntry(fpath)
        .catch(() => null))
      .then((entry) => {
        if (!entry) {
          if (!fpath.length && urlType === 'root') {
            // 'root' view
            res.send(`<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<p>root view not implemented yet.</body></html>`);
          } else if (!fpath.length && urlType === 'tree') {
            // 'tree' view
            res.send(`<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<p>tree view not implemented yet.</body></html>`);
          } else {
            res.status(404).send(`not found: ${escape(fpath)}`);
          }
          return;
        }
        if (entry.isTree() && (urlType === 'tree')) {
          // directory view
          res.send(`<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<br>path: ${escape(fpath)}<p>directory view not implemented yet.</body></html>`);
        } else if (entry.isBlob() && urlType === 'blob') {
          // single file view
          res.send(`<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<br>path: ${escape(fpath)}<p>file view not implemented yet.</body></html>`);
        } else {
          res.status(404).send(`not found: ${escape(fpath)}`);
        }
      })
      .catch((err) => {
        // TODO: return specific status (404, 500, etc)
        next(err);
      })
      .finally(() => {
        // TODO: cache Repository instances (key: absolute path)
        repo.free();
      });
  };
}
module.exports = createMiddleware;
