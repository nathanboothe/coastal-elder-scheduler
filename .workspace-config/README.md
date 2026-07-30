# workspace-config

Shared standards (editor config, lint rules, git hooks, CI templates) for all of
Nathan's repos — PowerShell, Python, C#/.NET, and web/JS.

This repo isn't meant to be cloned and used on its own. It gets pulled into each
of your other repos as a git **subtree** at `.workspace-config/`, then a
PowerShell script copies the files each repo actually needs (based on what
languages it detects) into the locations tools expect — repo root for lint
configs, `.github/workflows/` for CI.

## Why subtree + a copy script instead of submodules or symlinks?

- **Submodules** require every clone to run `git submodule update --init`,
  and GitHub Actions runners don't check them out by default. One more thing
  to forget.
- **Symlinks** are painful on Windows without Developer Mode or admin rights,
  and GitHub Actions workflows are **only** picked up if the actual `.yml`
  file physically exists under `.github/workflows/` in that repo — a symlink
  or submodule path doesn't trigger runs.
- **Subtree** embeds the content directly in the consuming repo's history —
  no extra init step, works everywhere `git` works — and a small PowerShell
  script re-materializes the handful of files that must be physical copies
  (CI workflows) or that tools expect at a fixed root path (`.editorconfig`,
  `.pre-commit-config.yaml`).

You still get single-source-of-truth updates: change a config here, run
`Install-WorkspaceConfig.ps1 -Update` in each consuming repo, commit the
result.

## Layout

```
workspace-config/
├── editorconfig/.editorconfig        # single source of truth, copied to every repo's root
├── lint/
│   ├── powershell/PSScriptAnalyzerSettings.psd1
│   ├── python/ruff.toml
│   ├── dotnet/Directory.Build.props
│   └── js/
│       ├── eslint.config.js
│       └── .prettierrc.json
├── hooks/.pre-commit-config.yaml     # copied to every repo's root
├── github-workflows/
│   ├── powershell-ci.yml
│   ├── python-ci.yml
│   ├── dotnet-ci.yml
│   └── node-ci.yml
├── scripts/
│   ├── Install-WorkspaceConfig.ps1   # run this from a target repo's root
│   └── Sync-WorkspaceConfig.ps1      # detects languages, copies matching files
└── manifest.json                     # maps ecosystem -> detection patterns -> files
```

## Usage in a target repo

First time:

```powershell
irm https://raw.githubusercontent.com/nathanboothe/workspace-config/main/scripts/Install-WorkspaceConfig.ps1 | iex
```

or, if you've cloned this repo locally already:

```powershell
& "C:\path\to\workspace-config\scripts\Install-WorkspaceConfig.ps1"
```

This adds `.workspace-config/` as a subtree and copies the matching files in.
Review with `git status`, then commit.

To pull in updates later:

```powershell
.\.workspace-config\scripts\Install-WorkspaceConfig.ps1 -Update
```

If a `.pre-commit-config.yaml` was installed, also run `pre-commit install`
once (requires `pip install pre-commit`, or `pipx install pre-commit`).

## Adding a new ecosystem or changing a rule

1. Edit or add the config file under `lint/<ecosystem>/` (or `editorconfig/`,
   `hooks/`, `github-workflows/`).
2. If it's a new ecosystem, add an entry to `manifest.json` with
   `detectPatterns` (globs that indicate the ecosystem is present) and
   `files` (source → dest mappings).
3. Commit and push here, then run `-Update` in whichever repos should pick it up.

## Status

No CI existed across repos before this — the templates under
`github-workflows/` are the starting point for each language. They run lint
only for now (no test execution assumed); tighten as each repo grows real
test suites.
