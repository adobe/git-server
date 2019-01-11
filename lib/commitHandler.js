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

const { commitLog } = require('./git');
const { resolveRepositoryPath } = require('./utils');

/**
 * Export the api handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @returns {function(*, *, *)} handler function
 */
function createMiddleware(options) {
  /**
   * Express middleware handling Git API Commits requests
   *
   * Only a small subset will be implemented
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/repos/commits/#list-commits-on-a-repository
   */
  return (req, res, next) => {
    // GET /repos/:owner/:repo/commits/?path=:path&sha=:sha
    const { owner } = req.params;
    const repoName = req.params.repo;
    const sha = req.query.sha || 'master';
    let fpath = req.query.path || '';

    // TODO: support filtering (author, since, until)
    // const { author, since, until } = req.query;

    const repPath = resolveRepositoryPath(options, owner, repoName);

    if (typeof fpath !== 'string') {
      res.status(400).send('Bad request');
      return;
    }
    // issue #247: lenient handling of redundant leading slashes in path
    while (fpath.length && fpath[0] === '/') {
      // trim leading slash
      fpath = fpath.substr(1);
    }

    const NOT_IMPL = 'not implemented';

    function email2avatarUrl(email) {
      const hash = crypto.createHash('md5').update(email).digest('hex');
      return `https://s.gravatar.com/avatar/${hash}`;
    }

    commitLog(repPath, sha, fpath)
      .then((commits) => {
        const host = req.mappedSubDomain ? `localhost:${options.listen[req.protocol].port}` : req.headers.host;
        const result = [];
        commits.forEach((commit) => {
          const parents = [];
          commit.parent.forEach(oid => parents.push({
            sha: oid,
            url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${oid}`,
            html_url: `${req.protocol}://${host}/repos/${owner}/${repoName}/commit/${oid}`,
          }));
          result.push({
            sha: commit.oid,
            node_id: NOT_IMPL,
            commit: {
              author: {
                name: commit.author.name,
                email: commit.author.email,
                date: new Date(commit.author.timestamp * 1000).toISOString(),
              },
              committer: {
                name: commit.committer.name,
                email: commit.committer.email,
                date: new Date(commit.committer.timestamp * 1000).toISOString(),
              },
              message: commit.message,
              tree: {
                sha: commit.tree,
                url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${commit.tree}`,
              },
              url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/commits/${commit.oid}`,
              comment_count: 0,
              verification: {
                verified: false,
                reason: NOT_IMPL,
                signature: NOT_IMPL,
                payload: NOT_IMPL,
              },
            },
            // TODO
            url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${commit.oid}`,
            html_url: `${req.protocol}://${host}/repos/${owner}/${repoName}/commit/${commit.oid}`,
            comments_url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${commit.oid}/comments`,
            author: {
              avatar_url: email2avatarUrl(commit.author.email),
              gravatar_id: '',
              // TODO
            },
            committer: {
              avatar_url: email2avatarUrl(commit.committer.email),
              gravatar_id: '',
              // TODO
            },
            parents,
          });
        });
        res.json(result);
      })
      .catch((err) => {
        options.logger.debug(`[commitHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`);
        next(err);
        // github seems to swallow errors and just return an empty array...
        // res.json([]);
      });
  };
}
module.exports = createMiddleware;
