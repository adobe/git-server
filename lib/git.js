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

const { resolve: resolvePath } = require('path');
const { PassThrough } = require('stream');

const fse = require('fs-extra');
const git = require('isomorphic-git');
git.plugins.set('fs', require('fs'));

/**
 * Various helper functions for reading git meta-data and content
 */

/**
 * Returns the name (abbreviated form) of the currently checked out branch.
 *
 * @param {string} dir git repo path
 * @returns {Promise<string>} name of the currently checked out branch
 */
async function currentBranch(dir) {
  return git.currentBranch({ dir, fullname: false });
}

/**
 * Parses Github url path subsegment `<ref>/<filePath>` (e.g. `master/some/file.txt`
 * or `some/branch/some/file.txt`) and returns an `{ ref, fpath }` object.
 *
 * Issue #53: Handle branch names containing '/' (e.g. 'foo/bar')
 *
 * @param {string} dir git repo path
 * @param {string} refPathName path including reference (branch or tag) and file path
 *                             (e.g. `master/some/file.txt` or `some/branch/some/file.txt`)
 * @returns {Promise<object>} an `{ ref, pathName }` object or `undefined` if the ref cannot
 *                            be resolved to an existing branch or tag.
 */
async function determineRefPathName(dir, refPathName) {
  const branches = await git.listBranches({ dir });
  const tags = await git.listTags({ dir });
  const refs = branches.concat(tags);
  // find matching refs
  const matchingRefs = refs.filter(ref => refPathName.startsWith(`${ref}/`));
  if (!matchingRefs.length) {
    return undefined;
  }
  // find longest matching ref
  const matchingRef = matchingRefs.reduce((a, b) => ((b.length > a.length) ? b : a));
  return { ref: matchingRef, pathName: refPathName.substr(matchingRef.length) };
}

/**
 * Determines whether the specified reference is currently checked out in the working dir.
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch or tag)
 * @returns {Promise<boolean>} `true` if the specified reference is checked out
 */
async function isCheckedOut(dir, ref) {
  let oidCurrent;
  return git.resolveRef({ dir, ref: 'HEAD' })
    .then((oid) => {
      oidCurrent = oid;
      return git.resolveRef({ dir, ref });
    })
    .then(oid => oidCurrent === oid)
    .catch(() => false);
}

/**
 * Returns the commit oid of the curent commit referenced by `ref`
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @returns {Promise<string>} commit oid of the curent commit referenced by `ref`
 * @throws {GitError} `err.code === 'ResolveRefError'`: invalid reference
 */
async function resolveCommit(dir, ref) {
  return git.resolveRef({ dir, ref })
    .catch(async (err) => {
      if (err.code === 'ResolveRefError') {
        // fallback: is ref a shortened oid prefix?
        const oid = await git.expandOid({ dir, oid: ref }).catch(() => { throw err; });
        return git.resolveRef({ dir, ref: oid });
      }
      // re-throw
      throw err;
    });
}

/**
 * Returns the blob oid of the file at revision `ref` and `pathName`
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @param {string} filePath relative path to file
 * @param {boolean} includeUncommitted include uncommitted changes in working dir
 * @returns {Promise<string>} blob oid of specified file
 * @throws {GitError} `err.code === 'TreeOrBlobNotFoundError'`: resource not found
 *                    `err.code === 'ResolveRefError'`: invalid reference
 */
async function resolveBlob(dir, ref, pathName, includeUncommitted) {
  const commitSha = await resolveCommit(dir, ref);

  // project-helix/#150: check for uncommitted local changes
  // project-helix/#183: serve newly created uncommitted files
  // project-helix/#187: only serve uncommitted content if currently
  //                     checked-out and requested refs match

  if (!includeUncommitted) {
    return (await git.readObject({ dir, oid: commitSha, filepath: pathName })).oid;
  }
  // check working dir status
  const status = await git.status({ dir, filepath: pathName });
  if (status.endsWith('unmodified')) {
    return (await git.readObject({ dir, oid: commitSha, filepath: pathName })).oid;
  }
  if (status.endsWith('absent') || status.endsWith('deleted')) {
    const err = new Error(`Not found: ${pathName}`);
    err.code = git.E.TreeOrBlobNotFoundError;
    throw err;
  }
  // return blob id representing working dir file
  const content = await fse.readFile(resolvePath(dir, pathName));
  return git.writeObject({
    dir,
    object: content,
    type: 'blob',
    format: 'content',
  });
}

/**
 * Returns the contents of the file at revision `ref` and `pathName`
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @param {string} filePath relative path to file
 * @param {boolean} includeUncommitted include uncommitted changes in working dir
 * @returns {Promise<Buffer>} content of specified file
 * @throws {GitError} `err.code === 'TreeOrBlobNotFoundError'`: resource not found
 *                    `err.code === 'ResolveRefError'`: invalid reference
 */
async function getRawContent(dir, ref, pathName, includeUncommitted) {
  return resolveBlob(dir, ref, pathName, includeUncommitted)
    .then(oid => git.readObject({ dir, oid, format: 'content' }).object);
}

/**
 * Returns a stream for reading the specified blob.
 *
 * @param {string} dir git repo path
 * @param {string} oid blob sha1
 * @returns {Promise<Stream>} readable Stream instance
 */
async function createBlobReadStream(dir, oid) {
  const { object: content } = await git.readObject({ dir, oid });
  const stream = new PassThrough();
  stream.end(content);
  return stream;
}

/**
 * Retrieves the specified object from the loose object store.
 *
 * @param {string} dir git repo path
 * @param {string} oid object id
 * @returns {Promise<Object>} object identified by `oid`
 */
async function getObject(dir, oid) {
  return git.readObject({ dir, oid });
}

/**
 * Checks if the specified string is a valid SHA-1 value.
 *
 * @param {string} str
 * @returns {boolean} `true` if `str` represents a valid SHA-1, otherwise `false`
 */
function isValidSha(str) {
  if (typeof str === 'string' && str.length === 40) {
    const res = str.match(/[0-9a-f]/g);
    return res && res.length === 40;
  }
  return false;
}

/**
 * Returns the tree object identified directly by its sha
 * or indirectly via reference (branch, tag or commit sha)
 *
 * @param {string} dir git repo path
 * @param {string} refOrSha either tree sha or reference (branch, tag or commit sha)
 * @returns {Promise<string>} commit oid of the curent commit referenced by `ref`
 * @throws {GitError} `err.code === 'ShortOidNotFound'`: invalid reference
 *                    `err.code === 'ReadObjectFail'`: not found
 */
async function resolveTree(dir, refOrSha) {
  if (isValidSha(refOrSha)) {
    // full commit or tree sha
    return git.readObject({ dir, oid: refOrSha })
      .then((obj) => {
        if (obj.type === 'tree') {
          return obj;
        }
        if (obj.type === 'commit') {
          return git.readObject({ dir, oid: obj.object.tree });
        }
        throw new Error(`unexpected object: ${obj}`);
      });
  }
  // reference (branch, tag, shorthand commit sha)
  return resolveCommit(dir, refOrSha)
    .then(oid => git.readObject({ dir, oid }))
    .then(obj => git.readObject({ dir, oid: obj.object.tree }));
}

/**
 * Returns a commit log, i.e. an array of commits in reverse chronological order.
 *
 * @param {string} dir git repo path
 * @param {string} ref reference (branch, tag or commit sha)
 * @param {string} path only commits containing this file path will be returned
 * @throws {GitError} `err.code === 'ResolveRefError'`: invalid reference
 *                    `err.code === 'ReadObjectFail'`: not found
 */
async function commitLog(dir, ref, path) {
  return git.log({ dir, ref, path })
    .catch(async (err) => {
      if (err.code === 'ResolveRefError') {
        // fallback: is ref a shortened oid prefix?
        const oid = await git.expandOid({ dir, oid: ref });
        return git.log({ dir, ref: oid, path });
      }
      // re-throw
      throw err;
    })
    .then(async (commits) => {
      if (typeof path === 'string' && path.length) {
        // filter by path
        let lastSHA = null;
        let lastCommit = null;
        const filteredCommits = [];
        for (let i = 0; i < commits.length; i += 1) {
          const commit = commits[i];
          /* eslint-disable no-await-in-loop */
          try {
            const o = await git.readObject({ dir, oid: commit.oid, filepath: path });
            if (i === commits.length - 1) {
              // file already existed in first commit
              filteredCommits.push(commit);
              break;
            }
            if (o.oid !== lastSHA) {
              if (lastSHA !== null) {
                filteredCommits.push(lastCommit);
              }
              lastSHA = o.oid;
            }
          } catch (err) {
            // file no longer there
            filteredCommits.push(lastCommit);
            break;
          }
          lastCommit = commit;
        }
        // unfiltered commits
        return filteredCommits;
      }
      // unfiltered commits
      return commits;
    });
}

module.exports = {
  currentBranch,
  getRawContent,
  resolveTree,
  resolveCommit,
  resolveBlob,
  isCheckedOut,
  createBlobReadStream,
  getObject,
  isValidSha,
  commitLog,
  determineRefPathName,
};
