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

const escape = require('escape-html');
const fs = require('fs');

const { defaultBranch, resolveCommit, resolveObject, determineRefPathName } = require('./git');
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
  return async (req, res, next) => {
    const { owner } = req.params;
    const repoName = req.params.repo;
    let refName = req.params.ref;
    let fpath = req.params[0] || '';

    const repPath = resolveRepositoryPath(options, owner, repoName);

    // issue: #53: handle branch names containing '/' (e.g. 'foo/bar')
    const parsed = await determineRefPathName(repPath, `${req.params.ref}/${req.params[0]}`);
    if (parsed) {
      refName = parsed.ref;
      fpath = parsed.pathName;
    }

    if (!refName) {
      // fallback to default branch
      refName = await defaultBranch(repPath);
    }

    // issue #247: lenient handling of redundant leading slashes in path
    while (fpath.length && fpath[0] === '/') {
      // trim leading slash
      fpath = fpath.substr(1);
    }

    // set response content type
    res.header('Content-Type', 'text/html');

    resolveCommit(repPath, refName)
      .then((commitOid) => resolveObject(repPath, commitOid, fpath)
        .catch(() => null))
      .then((blobOrTree) => {
        if (!blobOrTree) {
          if (!fpath.length && urlType === 'tree') {
            // 'tree' view
            res.send(`<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<p>tree view not implemented yet.</body></html>`);
          } else {
            res.status(404).send(`not found: ${escape(fpath)}`);
          }
          return;
        }

        const { type } = blobOrTree;
        if (!fpath.length && type === 'tree' && urlType === 'root') {
          // 'root' view
          res.send(`<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<p>root view not implemented yet.</body></html>`);
        } else if (type === 'tree' && urlType === 'tree') {
          // directory view
          res.send(`<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<br>path: ${escape(fpath)}<p>directory view not implemented yet.</body></html>`);
        } else if (type === 'blob' && urlType === 'blob') {
          // single file view
          res.send(`<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<br>path: ${escape(fpath)}<p>file view not implemented yet.</body></html>`);
        } else {
          res.status(404).send(`not found: ${escape(fpath)}`);
        }
      })
      .catch((err) => {
        options.logger.debug(`[htmlHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`);
        next(err);
      });
  };
}
module.exports = createMiddleware;
