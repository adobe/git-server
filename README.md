# git-server

## Status

[![codecov](https://img.shields.io/codecov/c/github/adobe/git-server.svg)](https://codecov.io/gh/adobe/git-server)
[![CircleCI](https://img.shields.io/circleci/project/github/adobe/git-server.svg)](https://circleci.com/gh/adobe/git-server)
[![GitHub license](https://img.shields.io/github/license/adobe/git-server.svg)](https://github.com/adobe/git-server/blob/master/LICENSE.txt)
[![GitHub issues](https://img.shields.io/github/issues/adobe/git-server.svg)](https://github.com/adobe/git-server/issues)
[![Renovate](https://badges.renovateapi.com/github/adobe/git-server)](https://github.com/marketplace/renovate)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/adobe/git-server.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/adobe/git-server/context:javascript)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

## Description

`git-server` serves a hierarchy of local Git repositories to Git clients accessing the repository over `http://` and `https://` protocol.

`git-server` expects the local Git repositories (either cloned or created with `git init`) to be organized as follows in the local file system:

```ascii
<repos_root_dir>/
├── <owner_1>/
│   └── <repo_1>
│   └── <repo_2>
├── <owner_2>/
│   └── <repo_1>
│   └── <repo_2>
```

Alternatively, a virtual repository mapping allows to 'mount' repositories independent of their location in the file system into a `<owner>/<repo>` hierarchy. A configuration example:

```js
  virtualRepos: {
    owner1: {
      repo1: {
        path: './repo1',
      },
    },
    owner2: {
      repo2: {
        path: '/repos/repo2',
      },
    },
  },
```

Repositories exposed via `git-server` can be used just like any repository hosted on GitHub, i.e. you can clone them and push changes to.
The repository contents can be accessed with the same url patterns you would use to request files managed on GitHub.

The following protocols and APIs are currently supported:

* [Git Raw protocol](#1-git-raw-protocol)
* [Git HTTP Transfer Protocols](#2-git-http-transfer-protocols)
* [GitHub API v3](#3-github-api-v3)

## Installation

```bash
cd <checkout dir>
npm install
```

## Getting started

`git-server` is configured via the `config.js` file which is expected to exist in the current working directory. Here's the default configuration:

```javascript
{
  appTitle: 'Helix Git Server',
  repoRoot: './repos',
  // repository mapping. allows to 'mount' repositories outside the 'repoRoot' structure.
  virtualRepos: {
    demoOwner: {
      demoRepo: {
        path: './virtual/example',
      },
    },
  },
  listen: {
    http: {
      port: 5000,
      host: '0.0.0.0',
    },
    /*
    // https is optional
    https: {
      // cert: if no file is specfied a selfsigned certificate will be generated on-the-fly
      // cert: './localhost.crt',
      // key: if no file is specfied a key will be generated on-the-fly
      // key: './localhost.key',
      port: 5443,
      host: '0.0.0.0',
    },
    */
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
    level: 'info', // fatal, error, warn, info, verbose, debug, trace
    logsDir: './logs',
    reqLogFormat: 'short', // used for morgan (request logging)
  },
}
```

`git-server` uses [helix-log](https://github.com/adobe/helix-log) for logging. The log level (`fatal`, `error`, `warn`, `info`, `verbose`, `debug`, `trace`) can be set via the `logs.level` property in the config (see above). For more information please refer to the [helix-log](https://github.com/adobe/helix-log) project.

### 1. Create a local Git repository

```bash
cd ./repos
# create org
mkdir helix && cd helix
# initialize new git repo
mkdir test && cd test && git init
# allow to remotely push to this repo
git config receive.denyCurrentBranch updateInstead
# add a README.md
echo '# test repo'>README.md
git add . && git commit -m '1st commit'
cd ../../..
```

### 2. Start server

```bash
npm start
```

### 3. Fetch raw content of file in Git repo over http

```bash
curl http://localhost:5000/raw/helix/test/master/README.md
```

## Git Protocols and APIs

### <a name="raw_prot"></a>1. Git Raw Protocol

Serving content of a file in a git repo.

The requested file is specified by:

* `{owner}`: GitHub organization or user
* `{repo}`: repository name
* `{ref}`: Git reference
  * branch name (e.g. `master`)
  * tag name (e.g. `v1.0`)
  * (full or shorthand) commit id (e.g. `7aeff3d`)

GitHub URLs:

* `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/path/to/file`
* `https://github.com/{owner}/{repo}/raw/{ref}/path/to/file`

Local `git-server` URLs:

* `http://localhost:{port}/raw/{owner}/{repo}/{ref}/path/to/file`
* `http://localhost:{port}/{owner}/{repo}/raw/{ref}/path/to/file`
* `http://raw.localtest.me:{port}/{owner}/{repo}/{ref}/path/to/file` (using wildcarded DNS domain resolving to `127.0.0.1`)

Remote examples:

* `https://raw.githubusercontent.com/adobe/project-helix/master/README.md`
* `https://github.com/adobe/project-helix/raw/master/README.md`

Local examples:

* `http://raw.localtest.me:5000/adobe/project-helix/master/README.md`
* `http://localhost:5000/adobe/project-helix/raw/master/README.md`
* `http://localhost:5000/raw/adobe/project-helix/master/README.md`

`raw.githubusercontent.com` serves certain file types (e.g. JavaScript, CSS, HTML) with incorrect `Content-Type: text/plain` header. 3rd party solutions like `rawgit.com` address this issue. `git-server` serves files with correct content type.

### <a name="xfer_prot"></a>2. Git HTTP Transfer Protocols

Support for `git clone, push, fetch`

Documentation:

* [10.6 Git Internals - Transfer Protocols](https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols)
* [Git HTTP transport protocol documentation](https://github.com/git/git/blob/master/Documentation/technical/http-protocol.txt)

#### `git push` support

The served local repo needs to be either a *bare* repo (`git clone --bare` or `git init --bare`) or the following option needs to be set:

```bash
git config receive.denyCurrentBranch updateInstead
```

[more information](https://stackoverflow.com/questions/804545/what-is-this-git-warning-message-when-pushing-changes-to-a-remote-repository/28262104#28262104)

### 3. GitHub API v3

Documentation: [GitHub API v3](https://developer.github.com/v3/)

GitHub Endpoint: `https://api.github.com/`

Local endpoint: `http://localhost:{port}/api` or e.g. `http://api.localtest.me:{port}` (using wildcarded DNS domain resolving to `127.0.0.1`)

Only a small subset of the GitHub API will be supported:

* [Get contents](https://developer.github.com/v3/repos/contents/#get-contents)

  _Note:_ The GitHub implementation supports files up to 1 megabyte in size.

* [Get blob](https://developer.github.com/v3/git/blobs/#get-a-blob)

  _Note:_ The GitHub implementation supports blobs up to 100 megabytes in size.

* [Get tree](https://developer.github.com/v3/git/trees/#get-a-tree-recursively)

* [Get commits](https://developer.github.com/v3/repos/commits/#list-commits-on-a-repository)

* [Get archive link](https://developer.github.com/v3/repos/contents/#get-archive-link)

  _Note:_  This method returns a `302` to a URL to download a tarball or zipball archive for a repository. `git-server` also supports an unofficial `https://codeload.github.com` endpoint that is not rate limited and that doesn't redirect:

  * `https://codeload.github.com/{owner}/{repo}/[zip|tar.gz]/master`

  Related issue/discussion: [#5 Support codeload.github.com](https://github.com/adobe/git-server/issues/5#issuecomment-403072428)

Local examples:

* `http://api.localtest.me:5000/repos/adobe/project-helix/contents/README.md?ref=master`
* `http://api.localtest.me:5000/repos/adobe/project-helix/git/blobs/bf13fe66cbee379db6a3e4ebf0300b8bbc0f01b7`
* `http://localhost:5000/api/repos/adobe/project-helix/contents/README.md?ref=master`
* `http://localhost:5000/api/repos/adobe/project-helix/git/blobs/bf13fe66cbee379db6a3e4ebf0300b8bbc0f01b7`

### 4. GitHub-like Web Server

_(not yet implemented)_

Endpoint: `https://github.com/`

e.g.

  `https://github.com/{owner}/{repo}`,
  `https://github.com/{owner}/{repo}/blob/{branch}/path/to/file`
