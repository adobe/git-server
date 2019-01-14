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

const { getObject } = require('./git');
const { resolveRepositoryPath } = require('./utils');

/**
 * Export the api handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @returns {function(*, *, *)} handler function
 */
function createMiddleware(options) {
  /**
   * Express middleware handling Git API Blob requests
   *
   * Only a small subset will be implemented
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/git/blobs/#get-a-blob
   */
  return (req, res, next) => {
    // GET /repos/:owner/:repo/git/blobs/:file_sha
    const { owner } = req.params;
    const repoName = req.params.repo;
    const sha = req.params.file_sha;
    const host = req.mappedSubDomain ? `localhost:${options.listen[req.protocol].port}` : req.headers.host;

    const repPath = resolveRepositoryPath(options, owner, repoName);

    if (sha.match(/[0-9a-f]/g).length !== 40) {
      // invalid sha format
      res.status(422).json({
        message: 'The sha parameter must be exactly 40 characters and contain only [0-9a-f].',
        documentation_url: 'https://developer.github.com/v3/git/blobs/#get-a-blob',
      });
      return;
    }
    getObject(repPath, sha)
      .then(({ object: content }) => {
        res.json({
          sha,
          size: content.length,
          url: `${req.protocol}://${host}${req.path}`,
          content: `${content.toString('base64')}\n`,
          encoding: 'base64',
        });
      })
      .catch((err) => {
        // TODO: use generic errors
        if (err.code === 'ReadObjectFail') {
          options.logger.debug(`[blobHandler] resource not found: ${err.message}`);
          res.status(404).json({
            message: 'Not Found',
            documentation_url: 'https://developer.github.com/v3/git/blobs/#get-a-blob',
          });
        } else {
          options.logger.debug(`[blobHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`);
          next(err);
        }
      });
  };
}
module.exports = createMiddleware;
