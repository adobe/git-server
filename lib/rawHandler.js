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

const { isCheckedOut, resolveBlob, createBlobReadStream } = require('./git');
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
  return (req, res, next) => {
    const { owner } = req.params;
    const repoName = req.params.repo;
    const refName = req.params.ref;
    let fpath = req.params[0];

    // issue #247: lenient handling of redundant leading slashes in path
    while (fpath.length && fpath[0] === '/') {
      // trim leading slash
      fpath = fpath.substr(1);
    }

    // TODO: handle branch names containing '/' (e.g. 'foo/bar')

    const repPath = resolveRepositoryPath(options, owner, repoName);

    // issue #187: serve modified content only if the requested ref is currently checked out
    const serveUncommitted = isCheckedOut(repPath, refName);
    resolveBlob(repPath, refName, fpath, serveUncommitted)
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
        // TODO: use abstract errors
        if (err.code === 'TreeOrBlobNotFoundError') {
          options.logger.debug(`[rawHandler] resource not found: ${err.message}`);
          res.status(404).send('not found.');
        } else {
          options.logger.debug(`[rawHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`);
          next(err);
        }
      });
  };
}
module.exports = createMiddleware;
