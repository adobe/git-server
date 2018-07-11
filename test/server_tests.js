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
const http = require('http');
const https = require('https');
const { URL } = require('url');
const server = require('../lib/server.js');
const tcpPortUsed = require('tcp-port-used');

const TEST_DIR_DEFAULT = path.resolve(__dirname, 'integration/default');

if (!shell.which('git')) {
  shell.echo('Sorry, this tests requires git');
  shell.exit(1);
}

async function assertStatus(url, status) {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.path,
      rejectUnauthorized: false,
    };
    client.get(options, (res) => {
      try {
        assert.equal(res.statusCode, status);
      } catch (e) {
        reject(e);
      }
      resolve();
    }).on('error', (e) => {
      reject(e);
    });
  });
}

async function checkPort(port, inUse) {
  assert.equal(await tcpPortUsed.check(port, '127.0.0.1'), inUse, `port ${port} should ${inUse ? '' : 'not '}be in use.`);
}

function initRepository(dir) {
  shell.cd(dir);
  shell.exec('git init');
  shell.exec('git add -A');
  shell.exec('git commit -m"initial commit."');
}

function removeRepository(dir) {
  shell.rm('-rf', path.resolve(dir, '.git'));
}

describe('Server Test', () => {
  before(() => {
    initRepository(TEST_DIR_DEFAULT);
  });

  after(() => {
    removeRepository(TEST_DIR_DEFAULT);
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
    await assertStatus(new URL(`http://localhost:${state.httpPort}`), 404);
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
    await assertStatus(new URL(`http://localhost:${state.httpPort}`), 404);
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
    await assertStatus(new URL(`https://localhost:${state.httpsPort}`), 404);
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
    await assertStatus(new URL(`https://localhost:${state.httpsPort}`), 404);
    await server.stop();
    await checkPort(state.httpPort, false);
    await checkPort(state.httpsPort, false);
  });
});
