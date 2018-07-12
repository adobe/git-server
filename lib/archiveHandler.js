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

const fse = require('fs-extra');
const Git = require('nodegit');

const { resolveRepositoryPath, createBlobReadStream, randomFileOrFolderName } = require('./utils');

/**
 * Determines whether dirty, i.e. uncommitted content should be delivered.
 *
 * @param {Git.Reference} headRef HEAD reference (currently checked out branch or tag)
 * @param {Git.Reference} reqRef requested reference (branch or tag)
 */
function serveUncommittedContent(headRef, reqRef) {
  // serve dirty content only if currently checked out and requested refs match
  return !headRef.cmp(reqRef);
}

/**
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

  const results = [];

  const walker = tree.walk(false);
  walker.on('entry', (entry) => {
    const p = entry.path();
    const isDir = entry.isTree();
    if (isDir) {
      results.push(fse.mkdir(path.join(tmpDir, p)));
      console.log(`[dir] ${p}`);
    } else {
      results.push(entry.getBlob()
        .then(blob => createBlobReadStream(repo, blob, p, serveUncommitted))
        .then((stream) => {
          stream.pipe(fse.createWriteStream(path.join(tmpDir, p)));
        }));
      console.log(`[file] ${p}`);
    }
  });
  results.push(new Promise((resolve, reject) => {
    walker.on('end', () => resolve());
    walker.on('error', err => reject(err));
  }));

  walker.start();
  return Promise.all(results).then(() => tmpDir);
}

function serializeTree1(repo, tree, serveUncommitted, outDir) {
  const tmpDir = path.join(outDir || os.tmpdir(), randomFileOrFolderName());
  return fse.ensureDir(tmpDir)
    .then(() => {
      return new Promise((resolve, reject) => {
        const walker = tree.walk(false);
        walker.on('entry', (entry) => {
          const p = entry.path();
          const isDir = entry.isTree();
          if (isDir) {
            // TODO: FIXME
            fse.mkdirSync(path.join(tmpDir, p));
            console.log(`[dir] ${p}`);
          } else {
            createBlobReadStream(repo, tree, p, serveUncommitted)
              .then((stream) => {
                stream.pipe(fse.createWriteStream(path.join(tmpDir, p)));
              });
            console.log(`[file] ${p}`);
          }
        });
        walker.on('end', () => resolve(tmpDir));
        walker.on('error', err => reject(err));

        walker.start();
      });
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
      .then(commit => commit.getTree())
      .then(tree => serializeTree(repo, tree, serveUncommitted, './tmp'))
      .then(dir => console.log(dir))
      .catch((err) => {
        // TODO: return specific status (404, 500, etc)?
        next(err);
      })
      .finally(() => {
        // TODO: cache Repository instances (key: absolute path)
        //repo.free();
      });
  };
}
module.exports = createMiddleware;
