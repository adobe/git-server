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

/* eslint-env mocha */

const assert = require('assert');
const path = require('path');
const { promisify } = require('util');

const shell = require('shelljs');
const fse = require('fs-extra');
const tcpPortUsed = require('tcp-port-used');
const rp = require('request-promise-native');
const tmp = require('tmp');

const server = require('../lib/server.js');

const TEST_DIR_DEFAULT = path.resolve(__dirname, 'integration/default');

const SOME_RANDOM_SHA = '7e30e826a2bf98b8c34408048754d8851980affd';

if (!shell.which('git')) {
  shell.echo('Sorry, this tests requires git');
  shell.exit(1);
}

const mkTmpDir = promisify(tmp.dir);

// TODO: use replay ?
async function assertResponse(uri, status, spec) {
  const resp = await rp({
    uri,
    resolveWithFullResponse: true,
    simple: false,
    rejectUnauthorized: false,
    followRedirect: false,
  });
  assert.equal(resp.statusCode, status);
  if (spec) {
    const expected = (await fse.readFile(path.resolve(__dirname, 'specs', spec))).toString();
    assert.equal(resp.body, expected);
  }
}

async function checkPort(port, inUse) {
  assert.equal(await tcpPortUsed.check(port, '127.0.0.1'), inUse, `port ${port} should ${inUse ? '' : 'not '}be in use.`);
}

async function initRepository(dir) {
  const pwd = shell.pwd();
  shell.cd(dir);
  shell.exec('git init');
  shell.exec('git symbolic-ref HEAD refs/heads/main');
  shell.exec('mkdir sub');
  shell.exec(`mkdir ${path.join('sub', 'sub')}`);
  shell.touch(path.join('sub', 'sub', 'some_file.txt'));
  shell.exec('git add -A');
  shell.exec('git commit -m"initial commit."');

  // setup 'new_branch'
  shell.exec('git checkout -b new_branch');
  shell.touch('new_file.txt');
  shell.exec('git add .');
  shell.exec('git commit -m "new_branch commit"');

  // setup 'branch/with_slash'
  shell.exec('git checkout -b branch/with_slash');
  shell.touch('another_new_file.txt');
  shell.exec('git add .');
  shell.exec('git commit -m "new_branch commit"');

  // setup 'config' branch
  shell.exec('git checkout main');
  shell.exec('git checkout -b config');
  shell.touch('config_file.txt');
  shell.exec('git add .');
  shell.exec('git commit -m "new_branch commit"');

  shell.exec('git checkout main');
  shell.cd(pwd);
}

describe('Server Test', function suite() {
  this.timeout(10000);

  let testRepoRoot;

  before(async () => {
    // copy default repos to tmp dir and setup git repos
    testRepoRoot = await mkTmpDir();
    await fse.copy(TEST_DIR_DEFAULT, testRepoRoot);
    await initRepository(path.resolve(testRepoRoot, 'owner1/repo1'));
  });

  after(() => {
    // cleanup: remove tmp repo root
    // Note: the async variant of remove hangs for some reason on windows
    fse.removeSync(testRepoRoot);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('Uses config.js in cwd', async () => {
    const configFilePath = path.join(process.cwd(), 'config.js');
    assert(await fse.exists(configFilePath));
    /* eslint-disable global-require */
    /* eslint-disable import/no-dynamic-require */
    const config = require(configFilePath);
    const state = await server.start();
    assert.equal(state.httpPort, config.listen.http.port);
    await checkPort(state.httpPort, true);
    await server.stop();
    await checkPort(state.httpPort, false);
  });

  it('Starts http server on default port', async () => {
    await checkPort(5000, false);

    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
    });
    assert.equal(state.httpPort, 5000);
    assert.equal(state.httpsPort, -1);
    await assertResponse(`http://localhost:${state.httpPort}`, 404);
    await server.stop();
    await checkPort(5000, false);
  });

  it('Starts http server on random port', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    assert.notEqual(state.httpPort, 5000);
    assert.equal(state.httpsPort, -1);
    await assertResponse(`http://localhost:${state.httpPort}`, 404);
    await server.stop();
    await checkPort(state.httpPort, false);
  });

  it('Starts https server on default port', async () => {
    await checkPort(5000, false);
    await checkPort(5443, false);

    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        https: {},
      },
    });
    assert.equal(state.httpPort, 5000);
    assert.equal(state.httpsPort, 5443);
    await assertResponse(`https://localhost:${state.httpsPort}`, 404);
    await server.stop();
    await checkPort(5000, false);
    await checkPort(5443, false);
  });

  it('Starts https server on random port', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
        https: {
          port: 0,
        },
      },
    });
    assert.notEqual(state.httpPort, 5000);
    assert.notEqual(state.httpsPort, -1);
    assert.notEqual(state.httpsPort, 5443);
    await assertResponse(`https://localhost:${state.httpsPort}`, 404);
    await server.stop();
    await checkPort(state.httpPort, false);
    await checkPort(state.httpsPort, false);
  });

  it('Delivers raw content.', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/main/README.md`, 200, 'expected_readme.md');
    await server.stop();
  });

  it('Delivers raw non git content.', async () => {
    const root = path.resolve(testRepoRoot, 'owner1', 'repo1');
    await fse.copy(path.resolve(root, 'README.md'), path.resolve(root, 'new_file.md'));

    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/main/new_file.md`, 200, 'expected_readme.md');
    await server.stop();
  });

  it('Delivers raw content with double slash.', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/main/sub/sub//some_file.txt`, 200);
    await server.stop();
  });

  it('Delivers 404 raw content case insensitive.', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/main/rEaDmE.md`, 404);
    await server.stop();
  });

  it('Delivers raw content on branch.', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/new_branch/README.md`, 200, 'expected_readme.md');
    await server.stop();
  });

  it('Delivers raw content on branch with slash.', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/branch/with_slash/README.md`, 200, 'expected_readme.md');
    await server.stop();
  });

  it('Delivers raw content on branch with name "config".', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/config/README.md`, 200, 'expected_readme.md');
    await server.stop();
  });

  it('Delivers 404 for raw content that does not exist.', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/main/notexist.md`, 404);
    await server.stop();
  });

  it('Delivers 404 for raw content that does not exist and is ignored.', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/main/ignored.txt`, 404);
    await server.stop();
  });

  it('Delivers 404 for raw content for non-existing branch', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/blaster/README.md`, 404);
    await server.stop();
  });

  it('Delivers 404 for raw content for non-existing repo', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/floppy/main/README.md`, 404);
    await server.stop();
  });

  it('Delivers 404 for raw content for non-existing owner', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/noowner/repo1/main/README.md`, 404);
    await server.stop();
  });

  it('Delivers 302 for GitHub API get-archive-link (zip)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/zipball/main`, 302);
    await server.stop();
  });

  it('Delivers 302 for GitHub API get-archive-link (tar.gz)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/tarball/main`, 302);
    await server.stop();
  });

  it('Delivers 302 for GitHub archive request (zip)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/archive/main.zip`, 302);
    await server.stop();
  });

  it('Delivers 302 for GitHub archive request (tar.gz)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/archive/main.tar.gz`, 302);
    await server.stop();
  });

  it('Delivers 200 for GitHub codeload request (zip)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/codeload/owner1/repo1/legacy.zip/main`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub codeload request (zip)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/codeload/owner1/repo1/zip/main`, 200);
    await server.stop();
  });

  it('GitHub codeload request (zip) returns correct mime type', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    const resp = await rp({
      uri: `http://localhost:${state.httpPort}/codeload/owner1/repo1/zip/main`,
      resolveWithFullResponse: true,
      simple: false,
      rejectUnauthorized: false,
      followRedirect: false,
    });
    assert.strictEqual(resp.statusCode, 200);
    assert.strictEqual(resp.headers['content-type'], 'application/zip');
    await server.stop();
  });

  it('Delivers 200 for GitHub codeload request (zip, non-default branch)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/codeload/owner1/repo1/legacy.zip/new_branch`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub codeload request (zip, non-default branch with slash)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/codeload/owner1/repo1/legacy.zip/branch/with_slash`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub codeload request (tar.gz)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/codeload/owner1/repo1/legacy.tar.gz/main`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub codeload request (tar.gz)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/codeload/owner1/repo1/tar.gz/main`, 200);
    await server.stop();
  });

  it('Tests codeload subdomain mapping', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
      subdomainMapping: {
        enable: true,
        baseDomains: [
          'localtest.me',
        ],
      },
    });
    await assertResponse(`http://codeload.localtest.me:${state.httpPort}/owner1/repo1/zip/main`, 200);
    await server.stop();
  });

  it('Tests codeload subdomain mapping', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
      subdomainMapping: {
        enable: true,
        baseDomains: [
          'localtest.me',
        ],
      },
    });
    await assertResponse(`http://codeload.localtest.me:${state.httpPort}/owner1/repo1/zip/main`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub API list-commits', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/commits`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub API list-commits with sha', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    let commits = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/commits`,
      json: true,
    });
    assert(commits.length);
    const { sha } = commits[0];
    commits = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/commits?sha=${sha}`,
      json: true,
    });
    assert(commits.length);
    assert.strictEqual(commits[0].sha, sha);
    commits = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/commits?sha=${sha.substr(0, 7)}`,
      json: true,
    });
    assert(commits.length);
    assert.strictEqual(commits[0].sha, sha);
    await server.stop();
  });

  it('Delivers 200 for GitHub API list-commits with ref', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/commits?sha=main`, 200);
    await server.stop();
  });

  it('Delivers 404 for GitHub API list-commits with nonexisting ref', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/commits?sha=doesnotexist`, 404);
    await server.stop();
  });

  it('Delivers 200 for GitHub API list-commits with path', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/commits?path=README.md`, 200);
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/commits?path=/README.md`, 200);
    await server.stop();
  });

  it('Delivers [] for GitHub API list-commits with nonexisting path', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    const commits = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/commits?path=nonexisting.file`,
      json: true,
    });
    assert.strictEqual(commits.length, 0);
    await server.stop();
  });

  it('Delivers 200 for GitHub API get-contents (file) (ref)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/contents/README.md?ref=main`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub API get-contents (file) (sha)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    // determine commit sha
    const commits = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/commits`,
      json: true,
    });
    assert(commits.length);
    const { sha } = commits[0];

    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/contents/README.md?ref=${sha}`, 200);
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/contents/README.md?ref=${sha.substr(0, 7)}`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub API get-contents in branch (file)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/contents/new_file.txt?ref=new_branch`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub API get-contents in branch with slash (file)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/contents/new_file.txt?ref=branch/with_slash`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub API get-contents (dir)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/contents?ref=main`, 200);
    await server.stop();
  });

  it('GitHub API get-content (dir) and get-blob', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    const entries = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/contents?ref=main`,
      json: true,
    });
    assert.strictEqual(entries.length, 3);
    assert.strictEqual(entries.filter((entry) => entry.name === 'README.md' && entry.type === 'file').length, 1);
    assert.strictEqual(entries.filter((entry) => entry.name === '.gitignore' && entry.type === 'file').length, 1);
    assert.strictEqual(entries.filter((entry) => entry.name === 'sub' && entry.type === 'dir').length, 1);
    const fileEntry = entries.filter((entry) => entry.name === 'README.md' && entry.type === 'file')[0];
    const blob = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/git/blobs/${fileEntry.sha}`,
      json: true,
    });
    assert.strictEqual(fileEntry.sha, blob.sha);
    await server.stop();
  });

  it('GitHub API get-tree', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    let resp = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/git/trees/main`,
      json: true,
    });
    assert.strictEqual(resp.tree.length, 3);
    assert.strictEqual(resp.tree.filter((entry) => entry.type === 'tree').length, 1);
    assert.strictEqual(resp.tree.filter((entry) => entry.type === 'blob').length, 2);
    const treeSha = resp.tree.filter((entry) => entry.type === 'tree')[0].sha;
    resp = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/git/trees/${treeSha}`,
      json: true,
    });
    assert.strictEqual(resp.tree.length, 1);
    const shortenedTreeSha = treeSha.substr(0, 7);
    resp = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/git/trees/${shortenedTreeSha}`,
      json: true,
    });
    assert.strictEqual(resp.tree.length, 1);
    try {
      resp = await rp({
        uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/git/trees/${SOME_RANDOM_SHA}`,
        json: true,
      });
      assert.fail();
    } catch (err) {
      assert.strictEqual(err.statusCode, 404);
    }
    resp = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/git/trees/main?recursive=1`,
      json: true,
    });
    assert.strictEqual(resp.tree.length, 5);
    assert.strictEqual(resp.tree.filter((entry) => entry.type === 'tree').length, 2);
    assert.strictEqual(resp.tree.filter((entry) => entry.type === 'blob').length, 3);
    await server.stop();
  });

  it('Delivers 200 for GitHub blob view (existing resource)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/blob/main/README.md`, 200);
    await server.stop();
  });

  it('Delivers 404 for GitHub blob view (nonexisting resource)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/blob/main/README99.md`, 404);
    await server.stop();
  });

  it('Delivers 200 for GitHub tree view (existing path)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/tree/main/`, 200);
    await server.stop();
  });

  it('Delivers 404 for GitHub tree view (nonexisting path)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/tree/main/blahblah`, 404);
    await server.stop();
  });

  it('Delivers 200 for GitHub root view', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1`, 200);
    await server.stop();
  });

  it('GitHub API get-content and get-blob', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    const content = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/contents/README.md?ref=main`,
      json: true,
    });
    const blob = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/git/blobs/${content.sha}`,
      json: true,
    });
    assert.equal(content.sha, blob.sha);
    await server.stop();
  });

  it('GitHub API get-blob returns 422 (invalid sha)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/git/blobs/01020304050607`, 422);
    await server.stop();
  });

  it('GitHub API get-blob returns 404 (blob not found)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/git/blobs/${SOME_RANDOM_SHA}`, 404);
    await server.stop();
  });

  it('git clone (Git Smart Transfer Protocol)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    const tmpDir = await mkTmpDir();
    return new Promise((resolve) => {
      shell.exec(`git clone http://localhost:${state.httpPort}/owner1/repo1.git`,
        { cwd: tmpDir, silent: true },
        async (code) => {
          await server.stop();
          await fse.remove(tmpDir);
          assert(!code);
          resolve();
        });
    });
  });

  it('git clone (Git Smart Transfer Protocol) virtual repo', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      virtualRepos: {
        org: {
          repo: {
            path: path.resolve(testRepoRoot, 'owner1/repo1'),
          },
        },
      },
      listen: {
        http: {
          port: 0,
        },
      },
    });
    const tmpDir = await mkTmpDir();
    return new Promise((resolve) => {
      shell.exec(`git clone http://localhost:${state.httpPort}/org/repo.git`,
        { cwd: tmpDir, silent: true },
        async (code) => {
          await server.stop();
          await fse.remove(tmpDir);
          assert(!code);
          resolve();
        });
    });
  });

  it('repository info', async () => {
    const cfg = {
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
    };
    await server.start(cfg);
    assert.equal((await server.getRepoInfo(cfg, 'owner1', 'repo1')).currentBranch, 'main');
    const pwd = shell.pwd();
    shell.cd(path.resolve(testRepoRoot, 'owner1/repo1'));
    shell.exec('git checkout new_branch');
    assert.equal((await server.getRepoInfo(cfg, 'owner1', 'repo1')).currentBranch, 'new_branch');
    shell.exec('git checkout branch/with_slash');
    assert.equal((await server.getRepoInfo(cfg, 'owner1', 'repo1')).currentBranch, 'branch/with_slash');
    shell.exec('git checkout main');
    shell.cd(pwd);
    await server.stop();
  });

  it('calls raw request listener.', async () => {
    const data = {};
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
      onRawRequest: ({
        req, repoPath, filePath, ref,
      }) => {
        // we can't test the entire request, so we just use the host header.
        data.host = req.headers.host;
        data.repoPath = repoPath;
        data.filePath = filePath;
        data.ref = ref;
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/main/README.md`, 200, 'expected_readme.md');
    await server.stop();
    assert.deepEqual(data, {
      host: `localhost:${state.httpPort}`,
      repoPath: path.resolve(testRepoRoot, 'owner1', 'repo1'),
      filePath: 'README.md',
      ref: 'main',
    });
  });

  it('ignores errors in raw request listener.', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: testRepoRoot,
      listen: {
        http: {
          port: 0,
        },
      },
      onRawRequest: () => {
        throw new Error('rumpel.');
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/main/README.md`, 200, 'expected_readme.md');
    await server.stop();
  });
});
