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

const os = require('os');
const path = require('path');

const archiver = require('archiver');
const async = require('async');
const fse = require('fs-extra');
const Git = require('nodegit');

const { resolveRepositoryPath, createBlobReadStream, randomFileOrFolderName } = require('./utils');

/**
 * Determines whether dirty, i.e. uncommitted content should be delivered (issue #187).
 *
 * @param {Git.Reference} headRef HEAD reference (currently checked out branch or tag)
 * @param {Git.Reference} reqRef requested reference (branch or tag)
 */
function serveUncommittedContent(headRef, reqRef) {
  // serve dirty content only if currently checked out and requested refs match
  return !headRef.cmp(reqRef);
}

/**
 * Recursively collects all tree entries (blobs and trees).
 *
 * @param {Git.Tree} tree tree instance to process
 * @param {Array<Git.TreeEntry>} allEntries array where tree entries will be added
 * @returns {Promise<Array<Git.TreeEntry>>} collected entries
 */
async function collectEntries(tree, allEntries) {
  return new Promise((resolve, reject) => {
    const walker = tree.walk(false);
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
 * Serializes the specified tree to the file system.
 *
 * @param {Git.Repositor} repo
 * @param {Git.Tree} tree
 * @param {boolean} serveUncommitted
 * @param {string} outDir
 * @returns {Promise<string>} created temp dir with serialized repository tree
 */
async function serializeTree(repo, tree, serveUncommitted, outDir) {
  const tmpDir = path.join(outDir || os.tmpdir(), randomFileOrFolderName());
  await fse.ensureDir(tmpDir);

  // recursively collect all entries (blobs and trees)
  const allEntries = await collectEntries(tree, []);

  const streamBlob = async (blob, p) => {
    const stream = await createBlobReadStream(repo, blob);
    return new Promise((resolve, reject) => {
      stream.pipe(fse.createWriteStream(path.join(tmpDir, p)))
        .on('error', err => reject(err))
        .on('finish', () => resolve());
    });
  };

  const process = async (entry) => {
    const p = entry.path();
    if (entry.isTree() || entry.isSubmodule()) {
      await fse.mkdir(path.join(tmpDir, p));
    } else {
      const blob = await entry.getBlob();
      await streamBlob(blob, p);
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
          resolve(tmpDir);
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
    let tmpDir;
    Git.Repository.open(repPath)
      .then((repository) => {
        repo = repository;
        return repo.head()
          .then((ref) => {
            headRef = ref;
            return repo.getReference(refName);
          })
          .then((reqRef) => {
            serveUncommitted = serveUncommittedContent(headRef, reqRef);
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
      .then((tree) => {
        // TODO: issue #187: if serveUncommitted==true build archive directly
        // from (.gitignore filtered) work dir instead of from serialized git tree

        // TODO: build/use cache of serialized trees (identified by commidId)
        return serializeTree(repo, tree, serveUncommitted, './tmp');
      })
      .then((dir) => {
        tmpDir = dir;
        // TODO: build archive from tmp dir
        console.log(dir);
      })
      .catch((err) => {
        next(err);
      })
      .finally(() => {
        // cleanup
        repo.free();
        if (tmpDir) {
          fse.remove(tmpDir);
        }
      });
  };
}
module.exports = createMiddleware;
