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

const Git = require('nodegit');

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

    let repo;

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

    async function commitHistory(startCommit) {
      const hist = startCommit.history();
      const commits = [];

      return new Promise((resolve) => {
        hist.on('commit', (commit) => {
          commits.push(commit);
        });
        hist.on('end', () => resolve(commits));
        hist.start();
      });
    }

    async function didCommitTouchFile(commit, filePath) {
      const diffs = await commit.getDiff();
      for (let i = 0; i < diffs.length; i += 1) {
        const diff = diffs[i];
        const numDeltas = diff.numDeltas();
        for (let j = 0; j < numDeltas; j += 1) {
          const delta = diff.getDelta(j);
          const oldFile = delta.oldFile();
          if (oldFile && oldFile.path() === filePath) {
            return true;
          }
          const newFile = delta.newFile();
          if (newFile && newFile.path() === filePath) {
            return true;
          }
        }
      }
      return false;
    }

    function email2avatarUrl(email) {
      const hash = crypto.createHash('md5').update(email).digest('hex');
      return `https://s.gravatar.com/avatar/${hash}`;
    }

    Git.Repository.open(repPath)
      .then((repository) => {
        repo = repository;
        if (sha === 'master') {
          return repo.getMasterCommit();
        }
        return repo.getBranchCommit(sha)
          .catch((err) => {
            /* eslint arrow-body-style: "off" */
            options.logger.debug(`[commitHandler] errno: ${err.errno} errorFuntion: ${err.errorFunction} message: ${err.message}`);

            // sha => commit id?
            // return repo.getCommit(sha);
            // support shorthand commit id's
            return Git.AnnotatedCommit.fromRevspec(repo, sha)
              .then(annCommit => repo.getCommit(annCommit.id()));
          });
      })
      .then(async (startCommit) => {
        let commits = await commitHistory(startCommit);
        if (fpath && fpath.length) {
          const filter = async c => didCommitTouchFile(c, fpath);
          const filterAsync = (array, filterFn) => Promise.all(array.map(entry => filterFn(entry)))
            .then(bits => array.filter(() => bits.shift()));

          commits = await filterAsync(commits, filter);
        }
        const host = req.mappedSubDomain ? `localhost:${options.listen[req.protocol].port}` : req.headers.host;
        const result = [];
        commits.forEach((commit) => {
          const parents = [];
          commit.parents().forEach(oid => parents.push({
            sha: oid.tostrS(),
            url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${oid.tostrS()}`,
            html_url: `${req.protocol}://${host}/repos/${owner}/${repoName}/commit/${oid.tostrS()}`,
          }));
          result.push({
            sha: commit.sha(),
            node_id: NOT_IMPL,
            commit: {
              author: {
                name: commit.author().name(),
                email: commit.author().email(),
                date: new Date(commit.author().when().time() * 1000).toISOString(),
              },
              committer: {
                name: commit.committer().name(),
                email: commit.committer().email(),
                date: new Date(commit.committer().when().time() * 1000).toISOString(),
              },
              message: commit.message(),
              tree: {
                sha: commit.treeId().toString(),
                url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${commit.treeId().toString()}`,
              },
              url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/commits/${commit.sha()}`,
              comment_count: 0,
              verification: {
                verified: false,
                reason: NOT_IMPL,
                signature: NOT_IMPL,
                payload: NOT_IMPL,
              },
            },
            // TODO
            url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${commit.sha()}`,
            html_url: `${req.protocol}://${host}/repos/${owner}/${repoName}/commit/${commit.sha()}`,
            comments_url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${commit.sha()}/comments`,
            author: {
              avatar_url: email2avatarUrl(commit.author().email()),
              gravatar_id: '',
              // TODO
            },
            committer: {
              avatar_url: email2avatarUrl(commit.committer().email()),
              gravatar_id: '',
              // TODO
            },
            parents,
          });
        });
        res.json(result);
      })
      .catch((err) => {
        if (err.errno === -3) {
          options.logger.debug(`[commitHandler] resource not found: ${err.message}`);
          res.status(404).json({
            message: 'Not Found',
          });
        } else {
          options.logger.debug(`[commitHandler] errno: ${err.errno} errorFuntion: ${err.errorFunction} message: ${err.message} stack: ${err.stack}`);
          next(err);
        }
      })
      .finally(() => {
        // TODO: cache Repository instances (key: absolute path)
        repo.free();
      });
  };
}
module.exports = createMiddleware;
