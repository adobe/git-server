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

const { join: joinPaths, relative: relativePaths } = require('path');

const Archiver = require('archiver');
const async = require('async');
const fse = require('fs-extra');
const klaw = require('klaw');
const Ignore = require('ignore');

const {
  isCheckedOut,
  createBlobReadStream,
  resolveCommit,
  getObject,
} = require('./git');
const { resolveRepositoryPath } = require('./utils');

const CACHE_DIR = './tmp';

/**
 * Recursively collects all tree entries (blobs and trees).
 *
 * @param {string} repPath git repository path
 * @param {object} tree git tree to process
 * @param {Array<object>} result array where tree entries will be collected
 * @param {string} treePath path of specified tree (will be prepended to child entries)
 * @returns {Promise<Array<object>>} collected entries
 */
async function collectTreeEntries(repPath, tree, result, treePath) {
  const entries = await Promise.all(tree.entries.map(async ({
    oid, type, mode, path,
  }) => ({
    oid, type, mode, path: joinPaths(treePath, path),
  })));
  result.push(...entries);
  // recurse into subtrees
  const treeEntries = entries.filter((entry) => entry.type === 'tree');
  for (let i = 0; i < treeEntries.length; i += 1) {
    const { oid, path } = treeEntries[i];
    /* eslint-disable no-await-in-loop */
    const { object: subTree } = await getObject(repPath, oid);
    await collectTreeEntries(repPath, subTree, result, path);
  }
  return result;
}

/**
 * Serializes the specified git tree as an archive (zip/tgz).
 *
 * @param {string} repPath git repository path
 * @param {object} tree git tree to process
 * @param {object} archiver Archiver instance
 * @returns {Promise<stream.Readable>} readable stream of archive
 */
async function archiveGitTree(repPath, tree, archive) {
  // recursively collect all entries (blobs and trees)
  const allEntries = await collectTreeEntries(repPath, tree, [], '');

  const process = async ({ type, oid, path }) => {
    if (type === 'tree' || type === 'commit') {
      // directory or submodule
      archive.append(null, { name: `${path}/` });
    } else {
      // blob
      const stream = await createBlobReadStream(repPath, oid);
      archive.append(stream, { name: path });
    }
  };

  return new Promise((resolve, reject) => {
    async.eachSeries(
      allEntries,
      async.asyncify(process),
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(archive);
        }
      },
    );
  });
}

/**
 * Recursively collects all directory entries (files and directories).
 *
 * @param {string} dirPath directory path
 * @param {Array<{{path: string, stats: fs.Stats}}>} allEntries array where entries will be added
 * @returns {Promise<Array<{{path: string, stats: fs.Stats}}>>} collected entries
 */
async function collectFSEntries(dirPath, allEntries) {
  // apply .gitignore rules
  const ignore = Ignore();
  const ignoreFilePath = joinPaths(dirPath, '.gitignore');
  if (await fse.pathExists(ignoreFilePath)) {
    const data = await fse.readFile(ignoreFilePath);
    ignore.add(data.toString());
  }
  ignore.add('.git');

  const filterIgnored = (item) => !ignore.ignores(relativePaths(dirPath, item));

  return new Promise((resolve, reject) => {
    klaw(dirPath, { filter: filterIgnored })
      .on('readable', function onAvail() {
        let item = this.read();
        while (item) {
          allEntries.push(item);
          item = this.read();
        }
      })
      .on('error', (err) => reject(err))
      .on('end', () => resolve(allEntries));
  });
}

/**
 * Serializes the specified git working directory as an archive (zip/tgz).
 *
 * @param {string} dirPath working directory
 * @param {object} archiver Archiver instance
 * @returns {Promise<stream.Readable>} readable stream of archive
 */
async function archiveWorkingDir(dirPath, archive) {
  // recursively collect all entries (files and directories)
  const allEntries = await collectFSEntries(dirPath, []);

  const process = (entry, cb) => {
    const p = relativePaths(dirPath, entry.path);
    if (p.length) {
      if (entry.stats.isDirectory()) {
        archive.append(null, { name: `${p}/` });
      } else {
        archive.append(fse.createReadStream(entry.path), { name: p });
      }
    }
    cb();
  };

  return new Promise((resolve, reject) => {
    async.eachSeries(
      allEntries,
      process,
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(archive);
        }
      },
    );
  });
}

/**
 * Export the archive handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @param {string} archiveFormat 'zip' or 'tar.gz'
 * @returns {function(*, *, *)} handler function
 */
function createMiddleware(options, archiveFormat) {
  /**
   * Express middleware handling GitHub 'codeload' archive requests
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/repos/contents/#get-archive-link
   */
  return async (req, res, next) => {
    // GET /:owner/:repo/:archive_format/:ref
    const { owner } = req.params;
    const repoName = req.params.repo;
    const refName = req.params.ref;

    const repPath = resolveRepositoryPath(options, owner, repoName);

    // project-helix/#187: serve modified content only if the requested ref is currently checked out
    const serveUncommitted = await isCheckedOut(repPath, refName);

    let commitSha;
    let archiveFileName;
    let archiveFilePath;

    resolveCommit(repPath, refName)
      .then((oid) => {
        commitSha = oid;
        return getObject(repPath, commitSha);
      })
      .then(({ object: commit }) => getObject(repPath, commit.tree))
      .then(async ({ object: tree }) => {
        archiveFileName = `${owner}-${repoName}-${serveUncommitted ? 'SNAPSHOT' : commitSha}${archiveFormat === 'zip' ? '.zip' : '.tgz'}`;
        archiveFilePath = joinPaths(CACHE_DIR, archiveFileName);
        await fse.ensureDir(CACHE_DIR);

        // check cache
        if (!serveUncommitted && await fse.pathExists(archiveFilePath)) {
          // no need to build archive, use cached archive file
          return fse.createReadStream(archiveFilePath); // lgtm [js/path-injection]
        }

        // build archive
        let archive;
        if (archiveFormat === 'zip') {
          // zip
          archive = new Archiver('zip', {
            zlib: { level: 9 }, // compression level
          });
        } else {
          // tar.gz
          archive = new Archiver('tar', {
            gzip: true,
            gzipOptions: {
              level: 9, // compression level
            },
          });
        }
        if (serveUncommitted) {
          // don't cache
          archive = await archiveWorkingDir(repPath, archive);
        } else {
          archive = await archiveGitTree(repPath, tree, archive);
        }

        return new Promise((resolve, reject) => {
          if (serveUncommitted) {
            // don't cache
            archive.finalize();
            resolve(archive);
          } else {
            // cache archive file
            archive.pipe(fse.createWriteStream(archiveFilePath)) // lgtm [js/path-injection]
              .on('finish', () => resolve(fse.createReadStream(archiveFilePath))) // lgtm [js/path-injection]
              .on('error', (err) => reject(err));
            archive.finalize();
          }
        });
      })
      .then((archiveStream) => {
        const mimeType = archiveFormat === 'zip' ? 'application/zip' : 'application/x-gzip';
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename=${archiveFileName}`,
        });
        archiveStream.pipe(res);
      })
      .catch((err) => {
        options.logger.debug(`[archiveHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`);
        next(err);
      });
  };
}
module.exports = createMiddleware;
