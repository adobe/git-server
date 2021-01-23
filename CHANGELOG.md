## [1.3.10](https://github.com/adobe/git-server/compare/v1.3.9...v1.3.10) (2021-01-23)


### Bug Fixes

* **deps:** update external fixes ([28cdfd2](https://github.com/adobe/git-server/commit/28cdfd2879884e6497041dc306f7042d56586d90))

## [1.3.9](https://github.com/adobe/git-server/compare/v1.3.8...v1.3.9) (2021-01-09)


### Bug Fixes

* **deps:** update dependency archiver to v5.2.0 ([af51b9c](https://github.com/adobe/git-server/commit/af51b9c26cd24bb62b039aa265ead20f48123f1c))

## [1.3.8](https://github.com/adobe/git-server/compare/v1.3.7...v1.3.8) (2020-11-18)


### Bug Fixes

* **deps:** update dependency @adobe/helix-log to v4.5.3 ([6c13c93](https://github.com/adobe/git-server/commit/6c13c939d8ca7f452b89aa2c4cc2daba0436ed7b))

## [1.3.7](https://github.com/adobe/git-server/compare/v1.3.6...v1.3.7) (2020-11-09)


### Bug Fixes

* use isomorphic-git 1.8.0 and use global cache for isomorphic-git APIs ([c6af315](https://github.com/adobe/git-server/commit/c6af315e44cf4487a592967ab203d62ba8e55a3c)), closes [#233](https://github.com/adobe/git-server/issues/233)

## [1.3.6](https://github.com/adobe/git-server/compare/v1.3.5...v1.3.6) (2020-10-31)


### Bug Fixes

* **deps:** update external fixes ([1acbe4f](https://github.com/adobe/git-server/commit/1acbe4f51df997aee8202c3904d9a371a81eab21))

## [1.3.5](https://github.com/adobe/git-server/compare/v1.3.4...v1.3.5) (2020-10-05)


### Bug Fixes

* handle annotated tags ([bd63a21](https://github.com/adobe/git-server/commit/bd63a21939609945a56dd3f291a65aafe7157f8b)), closes [#230](https://github.com/adobe/git-server/issues/230)

## [1.3.4](https://github.com/adobe/git-server/compare/v1.3.3...v1.3.4) (2020-09-29)


### Bug Fixes

* **deps:** update dependency @adobe/helix-log to v4.5.2 ([3883f0a](https://github.com/adobe/git-server/commit/3883f0a14706c80ab38ee54c4eeb09c9ae3946fa))

## [1.3.3](https://github.com/adobe/git-server/compare/v1.3.2...v1.3.3) (2020-07-27)


### Bug Fixes

* **deps:** update dependency archiver to v5 ([a3c7665](https://github.com/adobe/git-server/commit/a3c7665f23b6ff218c4ce3f2603e0543f50bbf01))

## [1.3.2](https://github.com/adobe/git-server/compare/v1.3.1...v1.3.2) (2020-07-24)


### Bug Fixes

* smarter fallback for default branch ([7057075](https://github.com/adobe/git-server/commit/7057075a0ab89d1164bd0e776273f8636fbc07b0))

## [1.3.1](https://github.com/adobe/git-server/compare/v1.3.0...v1.3.1) (2020-07-23)


### Bug Fixes

* **utils:** sanitize owner and repo name ([667d07e](https://github.com/adobe/git-server/commit/667d07e08fbe58288b53c5f245c5d8ca7aff4fca))

# [1.3.0](https://github.com/adobe/git-server/compare/v1.2.2...v1.3.0) (2020-07-20)


### Features

* replace references to "master" branch with "main" ([8b0feed](https://github.com/adobe/git-server/commit/8b0feed4c26017b648b99238af383a13ea77df86)), closes [#210](https://github.com/adobe/git-server/issues/210)

## [1.2.2](https://github.com/adobe/git-server/compare/v1.2.1...v1.2.2) (2020-07-20)


### Bug Fixes

* **git:** raw requests on ignored, non-existent files should not return 500 ([d48dffa](https://github.com/adobe/git-server/commit/d48dffab7c55e4fc73e4a09ce55af691198c3785)), closes [#205](https://github.com/adobe/git-server/issues/205)

## [1.2.1](https://github.com/adobe/git-server/compare/v1.2.0...v1.2.1) (2020-07-16)


### Bug Fixes

* **deps:** update dependency lodash to v4.17.19 [security] ([a07fc1a](https://github.com/adobe/git-server/commit/a07fc1a0f44ab7788b0714e28db4234111afeba3))

# [1.2.0](https://github.com/adobe/git-server/compare/v1.1.3...v1.2.0) (2020-06-21)


### Features

* **server:** add option to specify listener for raw requests ([#199](https://github.com/adobe/git-server/issues/199)) ([61d945a](https://github.com/adobe/git-server/commit/61d945af26ab213d689a6f680acf5cd6854e41f4))

## [1.1.3](https://github.com/adobe/git-server/compare/v1.1.2...v1.1.3) (2020-04-20)


### Bug Fixes

* **deps:** update dependency archiver to v4 ([28ea2ec](https://github.com/adobe/git-server/commit/28ea2ec4a7fea85637f96c4989e4d396b739c0f0))

## [1.1.2](https://github.com/adobe/git-server/compare/v1.1.1...v1.1.2) (2020-03-23)


### Bug Fixes

* **deps:** update dependency fs-extra to v9 ([ee167ad](https://github.com/adobe/git-server/commit/ee167ad36474b6d14aba540443776495cb285ae2))

## [1.1.1](https://github.com/adobe/git-server/compare/v1.1.0...v1.1.1) (2020-03-07)


### Bug Fixes

* adapt to latest isomorphic-git changes ([3c5d561](https://github.com/adobe/git-server/commit/3c5d5610e457a3f8bb439053f047a9bdedacddaa))

# [1.1.0](https://github.com/adobe/git-server/compare/v1.0.16...v1.1.0) (2020-03-06)


### Features

* port to isomorphic-git v1 ([58a9d64](https://github.com/adobe/git-server/commit/58a9d644c4383c2cce062aaeaab1daab19991376)), closes [#170](https://github.com/adobe/git-server/issues/170)

## [1.0.16](https://github.com/adobe/git-server/compare/v1.0.15...v1.0.16) (2020-02-25)


### Bug Fixes

* **deps:** update dependency @adobe/helix-log to v4.5.1 ([d3aab32](https://github.com/adobe/git-server/commit/d3aab32cd975e2be8678880614117a9cacd95075))

## [1.0.15](https://github.com/adobe/git-server/compare/v1.0.14...v1.0.15) (2020-02-18)


### Bug Fixes

* **server:** close idle connections on server stop ([fd5fb78](https://github.com/adobe/git-server/commit/fd5fb78026f20e7a30fd2b84d911627f2caaa254)), closes [#162](https://github.com/adobe/git-server/issues/162)

## [1.0.14](https://github.com/adobe/git-server/compare/v1.0.13...v1.0.14) (2020-01-22)


### Bug Fixes

* **deps:** update dependency @adobe/helix-log to v4.5.0 ([b8cb21b](https://github.com/adobe/git-server/commit/b8cb21b0903eafee32a53212720d57cda0d6bf7f))

## [1.0.13](https://github.com/adobe/git-server/compare/v1.0.12...v1.0.13) (2020-01-20)


### Bug Fixes

* **deps:** update external ([#154](https://github.com/adobe/git-server/issues/154)) ([dea4657](https://github.com/adobe/git-server/commit/dea4657c0235d15f3ee215737d2173dede7c966f))

## [1.0.12](https://github.com/adobe/git-server/compare/v1.0.11...v1.0.12) (2020-01-14)


### Bug Fixes

* **ci:** update to node 10 and debian-stretch ([5e68449](https://github.com/adobe/git-server/commit/5e684490410f9cc8484452ddb6c910ebb7a9f596))
* **deps:** update dependency @adobe/helix-log to v4.4.2 ([db75c9b](https://github.com/adobe/git-server/commit/db75c9bbf39d40be6000c62605e10083d2adb68a))

## [1.0.11](https://github.com/adobe/git-server/compare/v1.0.10...v1.0.11) (2020-01-09)


### Bug Fixes

* **log:** use helix-log SimpleInterface ([7766192](https://github.com/adobe/git-server/commit/7766192018ba11d4f150df730e1681dd1c01d69d)), closes [#147](https://github.com/adobe/git-server/issues/147)

## [1.0.10](https://github.com/adobe/git-server/compare/v1.0.9...v1.0.10) (2019-12-18)


### Bug Fixes

* **deps:** update dependency @adobe/helix-log to v4.4.1 ([7d02922](https://github.com/adobe/git-server/commit/7d0292292fd0f1723abf7ed1c6f33b15b163d633))

## [1.0.9](https://github.com/adobe/git-server/compare/v1.0.8...v1.0.9) (2019-12-05)


### Bug Fixes

* **deps:** update dependency @adobe/helix-log to v4.4.0 ([5f070e9](https://github.com/adobe/git-server/commit/5f070e91324984b6b7c9aaf040c956d1ed798950))

## [1.0.8](https://github.com/adobe/git-server/compare/v1.0.7...v1.0.8) (2019-12-04)


### Bug Fixes

* **deps:** update dependency @adobe/helix-log to v4.3.0 ([ddd81b5](https://github.com/adobe/git-server/commit/ddd81b5499351cb7bce203e9ab770b89fac2b644))

## [1.0.7](https://github.com/adobe/git-server/compare/v1.0.6...v1.0.7) (2019-12-04)


### Bug Fixes

* **deps:** update dependency @adobe/helix-log to v4.2.0 ([7d2c3db](https://github.com/adobe/git-server/commit/7d2c3db87a49b67b724e726dd179bc8cf2b8ad79))

## [1.0.6](https://github.com/adobe/git-server/compare/v1.0.5...v1.0.6) (2019-11-22)


### Bug Fixes

* **deps:** update dependency @adobe/helix-log to v4.1.0 ([8b27526](https://github.com/adobe/git-server/commit/8b275265402de1d94143dc6d2bf668a485bd5534))

## [1.0.5](https://github.com/adobe/git-server/compare/v1.0.4...v1.0.5) (2019-11-17)


### Bug Fixes

* **deps:** update dependency snyk to v1.248.0 ([5afc33f](https://github.com/adobe/git-server/commit/5afc33fdc2bb5a6576b74a017962e8971ce0f66d))

## [1.0.4](https://github.com/adobe/git-server/compare/v1.0.3...v1.0.4) (2019-11-08)


### Bug Fixes

* **deps:** update dependency @adobe/helix-log to v4 ([0fff6cb](https://github.com/adobe/git-server/commit/0fff6cbafa770b797ca3eb96e113cff642b3d16e))

## [1.0.3](https://github.com/adobe/git-server/compare/v1.0.2...v1.0.3) (2019-11-08)


### Bug Fixes

* **deps:** update any ([2964cec](https://github.com/adobe/git-server/commit/2964cecd72945d9f0414436b12c0d89411afe5c8))

## [1.0.2](https://github.com/adobe/git-server/compare/v1.0.1...v1.0.2) (2019-11-04)


### Bug Fixes

* **deps:** update dependency @adobe/helix-log to v3 ([674b049](https://github.com/adobe/git-server/commit/674b049d57f8ad949d641c4e47a44740b6808d5f))

## [1.0.1](https://github.com/adobe/git-server/compare/v1.0.0...v1.0.1) (2019-11-04)


### Bug Fixes

* **deps:** update any ([2369961](https://github.com/adobe/git-server/commit/236996146cf6115d971dfb612aa405d6a465f02f))

# [1.0.0](https://github.com/adobe/git-server/compare/v0.9.18...v1.0.0) (2019-08-20)


### Bug Fixes

* **server:** fix Promise executor [#120](https://github.com/adobe/git-server/issues/120) ([3d07d24](https://github.com/adobe/git-server/commit/3d07d24))
* **server:** pass unix paths to isomorphic-git ([#116](https://github.com/adobe/git-server/issues/116)) ([8072fd2](https://github.com/adobe/git-server/commit/8072fd2)), closes [#113](https://github.com/adobe/git-server/issues/113)


### chore

* Use helix-log ([86c7286](https://github.com/adobe/git-server/commit/86c7286))


### BREAKING CHANGES

* This changes the config api as no more logging config needs to be done.
