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

const Archiver = require('archiver');
const async = require('async');
const fse = require('fs-extra');
const Git = require('nodegit');
const klaw = require('klaw');
const Ignore = require('ignore');

const { resolveRepositoryPath, createBlobReadStream, serveUncommittedContent } = require('./utils');

const CACHE_DIR = './tmp';

/**
 * Recursively collects all tree entries (blobs and trees).
 *
 * @param {Git.Tree} tree tree instance to process
 * @param {Array<Git.TreeEntry>} allEntries array where tree entries will be added
 * @param {boolean} [blobsOnly = false] if false separate directory entries will be included
 * @returns {Promise<Array<Git.TreeEntry>>} collected entries
 */
async function collectTreeEntries(tree, allEntries, blobsOnly = false) {
  return new Promise((resolve, reject) => {
    const walker = tree.walk(blobsOnly);
    walker.on('entry', (entry) => {
      allEntries.push(entry);
    });
    walker.on('error', (err) => {
      reject(err);
    });
    walker.on('end', () => {
      resolve(allEntries);
    });
    walker.start();
  });
}

/**
 * Serializes the specified git tree as an archive (zip/tgz).
 *
 * @param {Git.Repositor} repo
 * @param {Git.Tree} tree
 * @param {object} archiver Archiver instance
 * @returns {Promise<stream.Readable>} readable stream of archive
 */
async function archiveGitTree(repo, tree, archive) {
  // recursively collect all entries (blobs and trees)
  const allEntries = await collectTreeEntries(tree, [], false);

  const process = async (entry) => {
    const p = entry.path();
    if (entry.isTree() || entry.isSubmodule()) {
      archive.append(null, { name: `${p}/` });
    } else {
      const blob = await entry.getBlob();
      const stream = await createBlobReadStream(repo, blob);
      archive.append(stream, { name: p });
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
  const ignoreFilePath = path.join(dirPath, '.gitignore');
  if (await fse.pathExists(ignoreFilePath)) {
    const data = await fse.readFile(ignoreFilePath);
    ignore.add(data.toString());
  }
  ignore.add('.git/');

  const filterIgnored = (item) => {
    return !ignore.ignores(path.relative(dirPath, item));
  };

  return new Promise((resolve, reject) => {
    klaw(dirPath, { filter: filterIgnored })
      .on('readable', function onAvail() {
        let item = this.read();
        while (item) {
          allEntries.push(item);
          item = this.read();
        }
      })
      .on('error', err => reject(err))
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
    const p = path.relative(dirPath, entry.path);
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
 * Export the raw content handler (express middleware) through a parameterizable function
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
  return (req, res, next) => {
    // GET /:owner/:repo/:archive_format/:ref
    const { owner } = req.params;
    const repoName = req.params.repo;
    const refName = req.params.ref;

    // TODO: handle branch names containing '/' (e.g. 'foo/bar')

    const repPath = resolveRepositoryPath(options, owner, repoName);

    let repo;
    let serveUncommitted = false;
    let headRef;
    let commitId;
    let archiveFileName;
    let archiveFilePath;
    Git.Repository.open(repPath)
      .then((repository) => {
        repo = repository;
        return repo.head()
          .then((ref) => {
            headRef = ref;
            return repo.getReference(refName);
          })
          .then((reqRef) => {
            serveUncommitted = serveUncommittedContent(repo, headRef, reqRef);
            return reqRef.peel(Git.Object.TYPE.COMMIT);
          })
          .then(obj => Git.Commit.lookup(repo, obj.id()))
          .catch(() => {
            /* eslint arrow-body-style: "off" */

            // ref => commit id?
            // return repo.getCommit(ref);
            // support shorthand commit id's
            return Git.AnnotatedCommit.fromRevspec(repo, refName)
              .then(annCommit => repo.getCommit(annCommit.id()));
          });
      })
      .then((commit) => {
        commitId = commit.id().tostrS();
        return commit.getTree();
      })
      .then(async (tree) => {
        archiveFileName = `${owner}-${repoName}-${serveUncommitted ? 'SNAPSHOT' : commitId}${archiveFormat === 'zip' ? '.zip' : '.tgz'}`;
        archiveFilePath = path.join(CACHE_DIR, archiveFileName);
        await fse.ensureDir(CACHE_DIR);

        // check cache
        if (!serveUncommitted && await fse.pathExists(archiveFilePath)) {
          // no need to build archive, use cached archive file
          return fse.createReadStream(archiveFilePath);
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
          archive = await archiveGitTree(repo, tree, archive);
        }

        return new Promise((resolve, reject) => {
          if (serveUncommitted) {
            // don't cache
            archive.finalize();
            resolve(archive);
          } else {
            // cache archive file
            archive.pipe(fse.createWriteStream(archiveFilePath))
              .on('finish', () => resolve(fse.createReadStream(archiveFilePath)))
              .on('error', err => reject(err));
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
        next(err);
      })
      .finally(() => {
        // cleanup
        repo.free();
      });
  };
}
module.exports = createMiddleware;
