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
   * Express middleware handling Git API Blob requests
   *
   * Only a small subset will be implemented
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/git/trees/#get-a-tree-recursively
   */
  return (req, res, next) => {
    // GET /repos/:owner/:repo/git/trees/:ref_or_sha?recursive
    const { owner } = req.params;
    const repoName = req.params.repo;
    const refOrSha = req.params.ref_or_sha;
    const recursive = typeof req.query.recursive !== 'undefined' && req.query.recursive !== '';
    const host = req.mappedSubDomain ? `localhost:${options.listen[req.protocol].port}` : req.headers.host;

    const repPath = resolveRepositoryPath(options, owner, repoName);

    async function dirEntryToJson(entry) {
      const tree = await entry.getTree();
      const sha = tree.id().tostrS();

      const url = `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`;
      return {
        path: entry.path(),
        mode: entry.filemode().toString(8).padStart(6, '0'),
        type: 'tree',
        sha,
        url,
      };
    }

    async function fileEntryToJson(entry) {
      const blob = await entry.getBlob();
      const sha = blob.id().tostrS();

      const url = `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/blobs/${sha}`;
      return {
        path: entry.path(),
        mode: entry.filemode().toString(8).padStart(6, '0'),
        type: 'blob',
        sha,
        size: blob.rawsize(),
        url,
      };
    }

    async function collectEntries(tree, result, deep) {
      const entries = tree.entries();
      result.push(...entries);
      if (deep) {
        const treeEntries = entries.filter(entry => entry.isTree());
        for (let i = 0; i < treeEntries.length; i += 1) {
          /* eslint-disable no-await-in-loop */
          await collectEntries(await treeEntries[i].getTree(), result, deep);
        }
      }
      return result;
    }

    async function treeEntriesToJson(tree, deep) {
      const entries = [];
      await collectEntries(tree, entries, deep);
      return Promise.all(entries.map((entry) => {
        /* eslint arrow-body-style: "off" */
        return entry.isBlob()
          ? fileEntryToJson(entry) : dirEntryToJson(entry);
      }));
    }

    let repo;
    Git.Repository.open(repPath)
      .then((repository) => {
        repo = repository;

        // refOrSha: it's either a reference (branch, tag, commit) pointing to the root tree
        // or a sha of a tree
        return repo.getReference(refOrSha)
          .then(ref => ref.peel(Git.Object.TYPE.COMMIT))
          .then(obj => Git.Commit.lookup(repo, obj.id()))
          .then(commit => commit.getTree())
          .catch(() => {
            /* eslint arrow-body-style: "off" */
            // ref => commit id?
            // return repo.getCommit(ref);
            // support shorthand commit id's
            return Git.AnnotatedCommit.fromRevspec(repo, refOrSha)
              .then(annCommit => repo.getCommit(annCommit.id()))
              .then(commit => commit.getTree())
              .catch(() => {
                /* eslint arrow-body-style: "off" */
                // fallback: refOrSha refers to sha of tree
                return repo.getTree(refOrSha);
              });
          });
      })
      .then((async (tree) => {
        const sha = tree.id().tostrS();
        res.json({
          sha,
          url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`,
          tree: await treeEntriesToJson(tree, recursive),
          truncated: false,
        });
      }))
      .catch((err) => {
        if (err.errno === -3) {
          options.logger.debug(`[treeHandler] resource not found: ${err.message}`);
          res.status(404).json({
            message: 'Not Found',
          });
        } else {
          options.logger.debug(`[treeHandler] errno: ${err.errno} errorFuntion: ${err.errorFunction} message: ${err.message} stack: ${err.stack}`);
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
