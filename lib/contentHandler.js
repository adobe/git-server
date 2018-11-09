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

const { resolveRepositoryPath } = require('./utils');

/**
 * Export the api handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @returns {function(*, *, *)} handler function
 */
function createMiddleware(options) {
  /**
   * Express middleware handling Git API Contents requests
   *
   * Only a small subset will be implemented
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/repos/contents/#get-contents
   */
  return (req, res, next) => {
    // GET /repos/:owner/:repo/contents/:path?ref=:ref
    const { owner } = req.params;
    const repoName = req.params.repo;
    const refName = req.query.ref || 'master';
    let fpath = req.params[0] || '';

    // issue #247: lenient handling of redundant leading slashes in path
    while (fpath.length && fpath[0] === '/') {
      // trim leading slash
      fpath = fpath.substr(1);
    }

    const repPath = resolveRepositoryPath(options, owner, repoName);

    async function dirEntryToJson(entry) {
      const tree = await entry.getTree();
      const sha = tree.id().tostrS();

      const host = req.mappedSubDomain ? `localhost:${options.listen[req.protocol].port}` : req.headers.host;
      const url = `${req.protocol}://${host}${req.path}?ref=${refName}`;
      const gitUrl = `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`;
      const htmlUrl = `${req.protocol}://${host}/${owner}/${repoName}/tree/${refName}/${entry.path()}`;
      return {
        type: 'dir',
        name: path.basename(entry.path()),
        path: entry.path(),
        sha,
        size: 0,
        url,
        html_url: htmlUrl,
        git_url: gitUrl,
        download_url: null,
        _links: {
          self: url,
          git: gitUrl,
          html: htmlUrl,
        },
      };
    }

    async function fileEntryToJson(entry, withContent) {
      const blob = await entry.getBlob();
      const sha = blob.id().tostrS();

      const host = req.mappedSubDomain ? `localhost:${options.listen[req.protocol].port}` : req.headers.host;
      const url = `${req.protocol}://${host}${req.path}?ref=${refName}`;
      const gitUrl = `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/blobs/${sha}`;
      const htmlUrl = `${req.protocol}://${host}/${owner}/${repoName}/blob/${refName}/${entry.path()}`;
      const rawlUrl = `${req.protocol}://${host}/raw/${owner}/${repoName}/${refName}/${entry.path()}`;
      const result = {
        type: 'file',
        name: path.basename(entry.path()),
        path: entry.path(),
        sha,
        size: blob.rawsize(),
        url,
        html_url: htmlUrl,
        git_url: gitUrl,
        download_url: rawlUrl,
        _links: {
          self: url,
          git: gitUrl,
          html: htmlUrl,
        },
      };
      if (withContent) {
        result.content = `${blob.content().toString('base64')}\n`;
        result.encoding = 'base64';
      }
      return result;
    }

    async function treeEntriesToJson(tree) {
      return Promise.all(tree.entries().map((entry) => {
        /* eslint arrow-body-style: "off" */
        return entry.isBlob()
          ? fileEntryToJson(entry, false) : dirEntryToJson(entry);
      }));
    }

    let repo;
    Git.Repository.open(repPath)
      .then((repository) => {
        repo = repository;
        return repo.getReference(refName)
          .then(ref => ref.peel(Git.Object.TYPE.COMMIT))
          .then(obj => Git.Commit.lookup(repo, obj.id()))
          .catch((err) => {
            options.logger.debug(`[contentHandler] errno: ${err.errno} errorFuntion: ${err.errorFunction} message: ${err.message}`);
            // ref => commit id?
            // return repo.getCommit(ref);
            // support shorthand commit id's
            return Git.AnnotatedCommit.fromRevspec(repo, refName)
              .then(annCommit => repo.getCommit(annCommit.id()));
          });
      })
      .then(commit => commit.getTree())
      .then((tree) => {
        if (!fpath.length) {
          // root dir
          return treeEntriesToJson(tree);
        }
        return tree.getEntry(fpath).then(async (entry) => {
          if (entry.isBlob()) {
            // file
            return fileEntryToJson(entry, true);
          }
          // dir
          return treeEntriesToJson(await entry.getTree());
        });
      })
      .then((json) => {
        res.json(json);
      })
      .catch((err) => {
        if (err.errno === -3) {
          options.logger.debug(`[contentHandler] resource not found: ${err.message}`);
          res.status(404).json({
            message: 'Not Found',
          });
        } else {
          options.logger.debug(`[contentHandler] errno: ${err.errno} errorFuntion: ${err.errorFunction} message: ${err.message} stack: ${err.stack}`);
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
