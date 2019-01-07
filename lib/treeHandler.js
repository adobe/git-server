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

const { join: joinPaths } = require('path');
const { resolveTree, getObject } = require('./git');
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

    async function dirEntryToJson({
      oid: sha, type, path, mode,
    }) {
      return {
        path,
        mode,
        type,
        sha,
        url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`,
      };
    }

    async function fileEntryToJson({
      oid: sha, type, path, mode,
    }) {
      const { object: content } = await getObject(repPath, sha);

      return {
        path,
        mode,
        type,
        sha,
        size: content.length,
        url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/blobs/${sha}`,
      };
    }

    async function collectTreeEntries(tree, result, treePath, deep) {
      const entries = tree.entries.map((entry) => {
        const copy = Object.assign({}, entry);
        copy.path = joinPaths(treePath, entry.path);
        return copy;
      });
      result.push(...entries);
      if (deep) {
        const treeEntries = entries.filter(entry => entry.type === 'tree');
        for (let i = 0; i < treeEntries.length; i += 1) {
          const { oid, path } = treeEntries[i];
          /* eslint-disable no-await-in-loop */
          const { object: subTree } = await getObject(repPath, oid);
          await collectTreeEntries(subTree, result, path, deep);
        }
      }
      return result;
    }

    async function treeEntriesToJson(tree, deep) {
      const result = [];
      await collectTreeEntries(tree, result, '', deep);
      return Promise.all(result.map(async (entry) => {
        /* eslint arrow-body-style: "off" */
        return entry.type === 'blob'
          ? fileEntryToJson(entry) : dirEntryToJson(entry);
      }));
    }

    resolveTree(repPath, refOrSha)
      .then(async ({ oid: sha, object: tree }) => {
        res.json({
          sha,
          url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`,
          tree: await treeEntriesToJson(tree, recursive),
          truncated: false,
        });
      })
      .catch((err) => {
        // TODO: use generic errors
        if (err.code === 'ReadObjectFail' || err.code === 'ShortOidNotFound') {
          options.logger.debug(`[treeHandler] resource not found: ${err.message}`);
          res.status(404).json({
            message: 'Not Found',
            documentation_url: 'https://developer.github.com/v3/git/trees/#get-a-tree',
          });
        } else {
          options.logger.debug(`[treeHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`);
          next(err);
        }
      });
  };
}
module.exports = createMiddleware;
