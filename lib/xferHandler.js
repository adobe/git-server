/*
 *  Copyright 2018 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

'use strict';

const path = require('path');
const { spawn } = require('child_process');
const zlib = require('zlib');

const backend = require('git-http-backend');

const logger = require('./logger');

/**
 * Export the transfer protocol handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @returns {function(*, *, *)} handler function
 */
function createMiddleware(options) {
  /**
   * Express middleware handling Git (Smart) Transfer Protocol requests
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols
   * @see https://github.com/git/git/blob/master/Documentation/technical/http-protocol.txt
   */
  return (req, res, next) => {
    const { owner, repo } = req.params;

    const repPath = path.resolve(options.repoRoot, owner, repo);
    const reqStream = req.headers['content-encoding'] === 'gzip' ? req.pipe(zlib.createGunzip()) : req;
    reqStream.pipe(backend(req.originalUrl, (err, service) => {
      if (err) {
        logger.error(err);
        next(err);
        return;
      }

      res.setHeader('content-type', service.type);
      logger.info(service.action, repo, service.fields);

      const ps = spawn(service.cmd, service.args.concat(repPath));
      ps.stdout.pipe(service.createStream()).pipe(ps.stdin);
    })).pipe(res);
  };
}
module.exports = createMiddleware;
