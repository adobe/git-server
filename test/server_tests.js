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
const shell = require('shelljs');
const path = require('path');
const fse = require('fs-extra');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const server = require('../lib/server.js');
const tcpPortUsed = require('tcp-port-used');

const TEST_DIR_DEFAULT = path.resolve(__dirname, 'integration/default');
const TEST_REPO_1 = path.resolve(TEST_DIR_DEFAULT, 'owner1/repo1');

if (!shell.which('git')) {
  shell.echo('Sorry, this tests requires git');
  shell.exit(1);
}

// todo: use replay ?
async function assertHttp(url, status, spec) {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    let data = '';
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      rejectUnauthorized: false,
    };
    client.get(options, (res) => {
      try {
        assert.equal(res.statusCode, status);
      } catch (e) {
        res.resume();
        reject(e);
      }

      res
        .on('data', (chunk) => {
          data += chunk;
        })
        .on('end', () => {
          try {
            if (spec) {
              const expected = fse.readFileSync(path.resolve(__dirname, 'specs', spec)).toString();
              assert.equal(data, expected);
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        });
    }).on('error', (e) => {
      reject(e);
    });
  });
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
    await assertHttp(new URL(`http://localhost:${state.httpPort}`), 404);
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
    await assertHttp(new URL(`http://localhost:${state.httpPort}`), 404);
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
    await assertHttp(new URL(`https://localhost:${state.httpsPort}`), 404);
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
    await assertHttp(new URL(`https://localhost:${state.httpsPort}`), 404);
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
    await assertHttp(new URL(`http://localhost:${state.httpPort}/raw/owner1/repo1/master/README.md`), 200, 'expected_readme.md');
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
    await assertHttp(new URL(`http://localhost:${state.httpPort}/raw/owner1/repo1/master/notexist.md`), 404);
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
    await assertHttp(new URL(`http://localhost:${state.httpPort}/raw/owner1/repo1/blaster/README.md`), 404);
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
    await assertHttp(new URL(`http://localhost:${state.httpPort}/raw/owner1/floppy/master/README.md`), 404);
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
    await assertHttp(new URL(`http://localhost:${state.httpPort}/raw/noowner/repo1/master/README.md`), 404);
    await server.stop();
  });
});
