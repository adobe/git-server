# Contributing to Git Server

This project is an Open Development/Inner Source project and welcomes contributions from everyone who finds it useful or lacking.

## Code Of Conduct

This project adheres to the Adobe [code of conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to cstaub at adobe dot com.

## Contributor License Agreement

All third-party contributions to this project must be accompanied by a signed contributor license. This gives Adobe permission to redistribute your contributions as part of the project. [Sign our CLA](http://opensource.adobe.com/cla.html)! You only need to submit an Adobe CLA one time, so if you have submitted one previously, you are good to go!

## Things to Keep in Mind

This project uses a **commit then review** process, which means that for approved maintainers, changes can be merged immediately, but will be reviewed by others.

For other contributors, a maintainer of the project has to approve the pull request.

# Before You Contribute

* Check that there is an existing issue in GitHub issues
* Check if there are other pull requests that might overlap or conflict with your intended contribution

# How to Contribute

1. Fork the repository
2. Make some changes on a branch on your fork
3. Create a pull request from your branch

In your pull request, outline:

* What the changes intend
* How they change the existing code
* If (and what) they breaks
* Start the pull request with the GitHub issue ID, e.g. #123

Lastly, please follow the [pull request template](PULL_REQUEST_TEMPLATE.md) when submitting a pull request!

Each commit message that is not part of a pull request:

* Should contain the issue ID like `#123`
* Can contain the tag `[trivial]` for trivial changes that don't relate to an issue



## Coding Styleguides

This project uses the [airbnb](https://www.npmjs.com/package/eslint-config-airbnb-base) eslint rules. 


## Commit message format

We use [semantic-release](https://github.com/semantic-release/semantic-release) for release management and require that all commits are properly formatted using the [Angular Commit Message Conventions](https://github.com/angular/angular.js/blob/master/DEVELOPERS.md#-git-commit-guidelines)

In order to help you craft a good commit message, we added [commitizen](https://www.npmjs.com/package/commitizen) as dev dependency, so you can just run 

```
$ npm run commit
```


# How Contributions get Reviewed

One of the maintainers will look at the pull request within one week.
Feedback on the pull request will be given in writing, in GitHub.

# Release Management

Releasing is done using [semantic-release](https://github.com/semantic-release/semantic-release), and every (relevant) commit to the `master` branch gets released automatically. The release will update the version number and add the recent changes to the [CHANGELOG.md](./CHANGELOG.md). It will also create a [release](https://github.com/adobe/helix-cli/releases) in github and finally publish the package to the [Adobe organization on npmjs.org](https://www.npmjs.com/org/adobe).
