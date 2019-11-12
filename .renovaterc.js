{
  "extends": [
    "config:base",
    "schedule:earlyMondays",
    ":semanticCommits"
  ],
  "timezone": "Europe/Zurich",
  "packageRules": [
    {
      "packagePatterns": [
        "^@adobe/"
      ],
      "groupName": "@adobe",
      "automerge": true,
      "major": {
        "automerge": false
      },
      "schedule": [
        "at any time"
      ]
    },
    {
      "packagePatterns": [
        "^.+"
      ],
      "excludePackagePatterns": [
        "^@adobe/"
      ],
      "groupName": "external",
      "patch": {
        "automerge": true
      }
    }
  ]
}