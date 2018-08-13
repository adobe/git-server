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

/* global describe, before, after, afterEach, it */

const assert = require('assert');
const path = require('path');

const shell = require('shelljs');
const fse = require('fs-extra');
const tcpPortUsed = require('tcp-port-used');
const rp = require('request-promise-native');
const tmp = require('tmp');

const server = require('../lib/server.js');

const TEST_DIR_DEFAULT = path.resolve(__dirname, 'integration/default');
const TEST_REPO_1 = path.resolve(TEST_DIR_DEFAULT, 'owner1/repo1');

if (!shell.which('git')) {
  shell.echo('Sorry, this tests requires git');
  shell.exit(1);
}

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

function initRepository(dir) {
  const pwd = shell.pwd();
  shell.cd(dir);
  shell.exec('git init');
  shell.exec('git add -A');
  shell.exec('git commit -m"initial commit."');
  shell.cd(pwd);
}

function removeRepository(dir) {
  shell.rm('-rf', path.resolve(dir, '.git'));
}

describe('Server Test', () => {
  before(() => {
    initRepository(TEST_REPO_1);
  });

  after(() => {
    removeRepository(TEST_REPO_1);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('Starts http server on default port', async () => {
    await checkPort(5000, false);

    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
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
      repoRoot: TEST_DIR_DEFAULT,
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
      repoRoot: TEST_DIR_DEFAULT,
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
      repoRoot: TEST_DIR_DEFAULT,
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
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/master/README.md`, 200, 'expected_readme.md');
    await server.stop();
  });

  it('Delivers 404 for raw content that does not exist.', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/repo1/master/notexist.md`, 404);
    await server.stop();
  });

  it('Delivers 404 for raw content for non-existing branch', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
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
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/owner1/floppy/master/README.md`, 404);
    await server.stop();
  });

  it('Delivers 404 for raw content for non-existing owner', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/raw/noowner/repo1/master/README.md`, 404);
    await server.stop();
  });

  it('Delivers 302 for GitHub API get-archive-link (zip)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/zipball/master`, 302);
    await server.stop();
  });

  it('Delivers 302 for GitHub API get-archive-link (tar.gz)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/tarball/master`, 302);
    await server.stop();
  });

  it('Delivers 302 for GitHub archive request (zip)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/archive/master.zip`, 302);
    await server.stop();
  });

  it('Delivers 302 for GitHub archive request (tar.gz)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/archive/master.tar.gz`, 302);
    await server.stop();
  });

  it('Delivers 200 for GitHub codeload request (zip)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/codeload/owner1/repo1/legacy.zip/master`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub codeload request (zip)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/codeload/owner1/repo1/zip/master`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub codeload request (tar.gz)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/codeload/owner1/repo1/legacy.tar.gz/master`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub codeload request (tar.gz)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/codeload/owner1/repo1/tar.gz/master`, 200);
    await server.stop();
  });

  it('Tests codeload subdomain mapping', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
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
    await assertResponse(`http://codeload.localtest.me:${state.httpPort}/owner1/repo1/zip/master`, 200);
    await server.stop();
  });

  it('Tests codeload subdomain mapping', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
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
    await assertResponse(`http://codeload.localtest.me:${state.httpPort}/owner1/repo1/zip/master`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub API list-commits', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/commits?sha=master`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub API get-contents', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/api/repos/owner1/repo1/contents/README.md?ref=master`, 200);
    await server.stop();
  });

  it('Delivers 200 for GitHub blob view (existing resource)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/blob/master/README.md`, 200);
    await server.stop();
  });

  it('Delivers 404 for GitHub blob view (nonexisting resource)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/blob/master/README99.md`, 404);
    await server.stop();
  });

  it('Delivers 200 for GitHub tree view (existing path)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/tree/master/`, 200);
    await server.stop();
  });

  it('Delivers 404 for GitHub tree view (nonexisting path)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    await assertResponse(`http://localhost:${state.httpPort}/owner1/repo1/tree/master/blahblah`, 404);
    await server.stop();
  });

  it('Delivers 200 for GitHub root view', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
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
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    const content = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/contents/README.md?ref=master`,
      json: true,
    });
    const blob = await rp({
      uri: `http://localhost:${state.httpPort}/api/repos/owner1/repo1/git/blobs/${content.sha}`,
      json: true,
    });
    assert.equal(content.sha, blob.sha);
    await server.stop();
  });

  it('git clone (Git Smart Transfer Protocol)', async () => {
    const state = await server.start({
      configPath: '<internal>',
      repoRoot: TEST_DIR_DEFAULT,
      listen: {
        http: {
          port: 0,
        },
      },
    });
    return new Promise((resolve, reject) => {
      tmp.dir((err, tmpDir) => {
        if (err) {
          reject(err);
          return;
        }
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
  });
});
