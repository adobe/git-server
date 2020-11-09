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

const {
  defaultBranch, resolveCommit, getObject, resolveObject, NotFoundError,
} = require('./git');
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
  return async (req, res, next) => {
    // GET /repos/:owner/:repo/contents/:path?ref=:ref
    const { owner } = req.params;
    const repoName = req.params.repo;
    let refName = req.query.ref;
    let fpath = req.params[0] || '';

    // issue #247: lenient handling of redundant leading slashes in path
    while (fpath.length && fpath[0] === '/') {
      // trim leading slash
      fpath = fpath.substr(1);
    }

    const repPath = resolveRepositoryPath(options, owner, repoName);

    if (!refName) {
      // fallback to default branch
      refName = await defaultBranch(repPath);
    }

    async function dirEntryToJson(sha, dirPath) {
      const host = req.mappedSubDomain ? `localhost:${options.listen[req.protocol].port}` : req.headers.host;
      const url = `${req.protocol}://${host}${req.path}?ref=${refName}`;
      const gitUrl = `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`;
      const htmlUrl = `${req.protocol}://${host}/${owner}/${repoName}/tree/${refName}/${dirPath}`;
      return {
        type: 'dir',
        name: path.basename(dirPath),
        path: dirPath,
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

    async function fileEntryToJson(sha, content, filePath, withContent) {
      const host = req.mappedSubDomain ? `localhost:${options.listen[req.protocol].port}` : req.headers.host;
      const url = `${req.protocol}://${host}${req.path}?ref=${refName}`;
      const gitUrl = `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/blobs/${sha}`;
      const htmlUrl = `${req.protocol}://${host}/${owner}/${repoName}/blob/${refName}/${filePath}`;
      const rawlUrl = `${req.protocol}://${host}/raw/${owner}/${repoName}/${refName}/${filePath}`;
      const result = {
        type: 'file',
        name: path.basename(filePath),
        path: filePath,
        sha,
        size: content.length,
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
        result.content = `${content.toString('base64')}\n`;
        result.encoding = 'base64';
      }
      return result;
    }

    async function treeEntriesToJson(entries, dirPath) {
      return Promise.all(entries.map(async (entry) => {
        if (entry.type === 'blob') {
          const { object: content } = await getObject(repPath, entry.oid);
          return fileEntryToJson(entry.oid, content, path.join(dirPath, entry.path), false);
        }
        return dirEntryToJson(entry.oid, path.join(dirPath, entry.path));
      }));
    }

    resolveCommit(repPath, refName)
      .then((commitOid) => resolveObject(repPath, commitOid, fpath))
      .then(({ type, oid, object }) => {
        if (type === 'blob') {
          // file
          return fileEntryToJson(oid, object, fpath, true);
        }
        // dir
        return treeEntriesToJson(object, fpath);
      })
      .then((json) => {
        res.json(json);
      })
      .catch((err) => {
        // TODO: use generic errors
        if (err instanceof NotFoundError) {
          options.logger.debug(`[contentHandler] resource not found: ${err.message}`);
          res.status(404).json({
            message: `No commit found for the ref ${refName}`,
            documentation_url: 'https://developer.github.com/v3/repos/contents/',
          });
        } else {
          options.logger.debug(`[contentHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`);
          next(err);
        }
      });
  };
}
module.exports = createMiddleware;
