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

module.exports = {
  appTitle: 'Helix Git Server',
  repoRoot: './repos',
  listen: {
    http: {
      port: 5000,
      host: '0.0.0.0',
    },
    https: {
      // cert: if no file is specfied a selfsigned certificate will be generated on-the-fly
      // cert: './localhost.crt',
      // key: if no file is specfied a key will be generated on-the-fly
      // key: './localhost.key',
      port: 5443,
      host: '0.0.0.0',
    },
  },
  subdomainMapping: {
    // if enabled, <subdomain>.<baseDomain>/foo/bar/baz will be
    // resolved/mapped to 127.0.0.1/<subdomain>/foo/bar/baz
    enable: true,
    baseDomains: [
      // some wildcarded DNS domains resolving to 127.0.0.1
      'localtest.me',
      'lvh.me',
      'vcap.me',
      'lacolhost.com',
    ],
  },
  logs: {
    level: 'info',
    logsDir: './logs',
    reqLogFormat: 'short', // used for morgan (request logging)
  },
};
