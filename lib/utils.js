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

/* eslint-disable no-underscore-dangle */

'use strict';

const path = require('path');

const fse = require('fs-extra');

const UNSAFE_GIT_NAME_CHARS_RE = /[^A-Za-z0-9_.-]/g;

/**
 * Resolves the file system path of the specified repository.
 *
 * @param {object} options configuration hash
 * @param {string} owner github org or user
 * @param {string} repo repository name
 */
function resolveRepositoryPath(options, owner, repo) {
  // GitHub Security Lab (GHSL) Vulnerability Report: GHSL-2020-133
  // sanitize owner and repo which are typically extracted
  // from a user entered url and are potentially unsafe to use
  // in fs paths (e.g. ../.. etc)
  const sanitize = (s) => {
    switch (s) {
      case '.':
      case '..':
        // '.' is a safe character in a git name but
        // '.' and '..' aren't valid git names
        return s.replace(/./g, '-');
      default:
        return s.replace(UNSAFE_GIT_NAME_CHARS_RE, '-');
    }
  };
  let repPath = path.resolve(options.repoRoot, sanitize(owner), sanitize(repo));

  if (options.virtualRepos[owner] && options.virtualRepos[owner][repo]) {
    repPath = path.resolve(options.virtualRepos[owner][repo].path);
  }
  return repPath;
}

module.exports._caseInsensitiveFS = undefined;

/**
 * Returns true if the file system where the current executable was
 * started from is case-insensitive, otherwise returns false.
 */
async function isCaseInsensitiveFS() {
  if (typeof module.exports._caseInsensitiveFS === 'undefined') {
    let lcStat;
    let ucStat;
    try {
      lcStat = await fse.stat(process.execPath.toLowerCase());
    } catch (err) {
      lcStat = false;
    }
    try {
      ucStat = await fse.stat(process.execPath.toUpperCase());
    } catch (err) {
      ucStat = false;
    }
    if (lcStat && ucStat) {
      module.exports._caseInsensitiveFS = lcStat.dev === ucStat.dev && lcStat.ino === ucStat.ino;
    } else {
      module.exports._caseInsensitiveFS = false;
    }
  }
  return module.exports._caseInsensitiveFS;
}

/**
 * Test whether or not a file system entry exists at `pathToTest` with the same case as specified.
 *
 * @param {string} parentDir parent directory where `pathToTest` is rooted
 * @param {string} pathToTest relative path with segements separated by `/`
 */
async function pathExists(parentDir, pathToTest) {
  if (!await isCaseInsensitiveFS()) {
    return fse.pathExists(path.join(parentDir, pathToTest));
  }

  let parent = parentDir;

  // pathToTest is using `/` for separating segments
  const names = pathToTest.split('/').filter((el) => el !== '');
  for (let i = 0; i < names.length; i += 1) {
    const nm = names[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      if (!(await fse.readdir(parent)).filter((el) => el === nm).length) {
        return false;
      }
    } catch (err) {
      return false;
    }
    parent = path.join(parent, nm);
  }
  return true;
}

module.exports = {
  resolveRepositoryPath,
  isCaseInsensitiveFS,
  pathExists,
};
