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
    let walker;

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
    const MAX_COMMIT_COUNT = 10000; // https://github.com/nodegit/nodegit/issues/1068

    function compileLog(commits, filePath, commitLog) {
      if (!commits.length) {
        // we're done
        return Promise.resolve(commitLog);
      }

      let lastSha;
      if (commitLog.length > 0) {
        lastSha = commitLog[commitLog.length - 1].sha();
        if (commits.length === 1 && commits[0].commit.sha() === lastSha) {
          return Promise.resolve(commitLog);
        }
      }

      commits.forEach(entry => commitLog.push(entry.commit));

      lastSha = commitLog[commitLog.length - 1].sha();

      walker = repo.createRevWalk();
      walker.push(lastSha);
      walker.sorting(Git.Revwalk.SORT.TIME);

      return walker.fileHistoryWalk(fpath, MAX_COMMIT_COUNT)
        .then(nextCommits => compileLog(nextCommits, filePath, commitLog));
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
          .catch(() => {
            /* eslint arrow-body-style: "off" */

            // sha => commit id?
            // return repo.getCommit(sha);
            // support shorthand commit id's
            return Git.AnnotatedCommit.fromRevspec(repo, sha)
              .then(annCommit => repo.getCommit(annCommit.id()));
          });
      })
      .then(async (commit) => {
        walker = repo.createRevWalk();
        walker.push(commit.sha());
        walker.sorting(Git.Revwalk.SORT.Time);
        if (!fpath.length) {
          return walker.getCommits(MAX_COMMIT_COUNT);
        }
        return walker.fileHistoryWalk(fpath, MAX_COMMIT_COUNT)
          .then(commits => compileLog(commits, fpath, []));
      })
      .then((commitLog) => {
        const host = req.mappedSubDomain ? `localhost:${options.listen[req.protocol].port}` : req.headers.host;
        const result = [];
        commitLog.forEach((commit) => {
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
