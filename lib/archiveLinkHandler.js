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

/**
 * Export the raw content handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @param {string} archiveFormat 'zip' or 'tar.gz'
 * @returns {function(*, *, *)} handler function
 */
function createMiddleware(options, archiveFormat) {
  /**
   * Express middleware handling GitHub API archive link requests
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/repos/contents/#get-archive-link
   */
  return (req, res) => {
    // GET /repos/:owner/:repo/:archive_format/:ref
    const { owner } = req.params;
    const repoName = req.params.repo;
    const refName = req.params.ref || 'master';

    // TODO: handle branch names containing '/' (e.g. 'foo/bar')

    const host = req.mappedSubDomain ? `localhost:${options.listen[req.protocol].port}` : req.headers.host;
    const location = `${req.protocol}://${host}/codeload/${owner}/${repoName}/${archiveFormat}/${refName}`;

    res.writeHead(302, {
      Location: location,
    });
    res.end();
  };
}
module.exports = createMiddleware;
