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

const Git = require('nodegit');

/* eslint no-unused-vars: "off" */
/**
 * Export the html handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @param {string} urlType 'root', 'tree' or 'blob'
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
    const refName = req.params.ref;
    const fpath = req.params[0];

    // TODO handle branch names containing '/' (e.g. 'foo/bar')

    const repPath = path.resolve(options.repoRoot, owner, repoName);
    let repo;
    Git.Repository.open(repPath)
      .then((repository) => {
        repo = repository;
        res.status(500).send('not implemented yet');
      })
      .catch((err) => {
        // TODO return specific status (404, 500, etc)
        next(err);
      })
      .finally(() => {
        // TODO cache Repository instances (key: absolute path)
        repo.free();
      });
  };
}
module.exports = createMiddleware;

