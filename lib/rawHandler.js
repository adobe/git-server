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

const mime = require('mime');
const path = require('path');
const { debug } = require('@adobe/helix-log');
const {
  isCheckedOut, resolveBlob, createBlobReadStream, determineRefPathName,
} = require('./git');
const { resolveRepositoryPath } = require('./utils');

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
  return async (req, res, next) => {
    const { owner } = req.params;
    const repoName = req.params.repo;
    let refName = req.params.ref;
    let fpath = req.params[0];

    let repPath = resolveRepositoryPath(options, owner, repoName);
    // temporary fix until isomorphic git can handle windows paths
    // see https://github.com/isomorphic-git/isomorphic-git/issues/783
    repPath = repPath.replace(/\\/g, '/');

    // issue: #53: handle branch names containing '/' (e.g. 'foo/bar')
    const parsed = await determineRefPathName(repPath, `${req.params.ref}/${req.params[0]}`);
    if (parsed) {
      refName = parsed.ref;
      fpath = parsed.pathName;
    }

    // issue #68: lenient handling of redundant slashes in path
    fpath = path.normalize(fpath);
    // temporary fix until isomorphic git can handle windows paths
    // see https://github.com/isomorphic-git/isomorphic-git/issues/783
    fpath = fpath.replace(/\\/g, '/');

    // remove leading slash
    if (fpath.length && fpath[0] === '/') {
      fpath = fpath.substr(1);
    }

    // project-helix/#187: serve modified content only if the requested ref is currently checked out
    isCheckedOut(repPath, refName)
      .then(serveUncommitted => resolveBlob(repPath, refName, fpath, serveUncommitted))
      .then((oid) => {
        const mimeType = mime.getType(fpath) || 'text/plain';
        res.writeHead(200, {
          'Content-Type': mimeType,
          ETag: oid,
          // TODO: review cache-control header
          'Cache-Control': 'max-age=0, private, must-revalidate',
        });
        createBlobReadStream(repPath, oid)
          .then(stream => stream.pipe(res));
      })
      .catch((err) => {
        // TODO: use generic errors
        if (err.code === 'TreeOrBlobNotFoundError' || err.code === 'ResolveRefError') {
          debug(`[rawHandler] resource not found: ${err.message}`);
          res.status(404).send('not found.');
        } else {
          debug(`[rawHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`);
          next(err);
        }
      });
  };
}
module.exports = createMiddleware;
