<p align="center">
  <img src="images/header.png" alt="VS Code X Defold">
</p>

# Defold Build Tools
<a href="https://discord.gg/eukcq5m"><img alt="Chat with us!" src="https://img.shields.io/discord/766898804896038942.svg?colorB=7581dc&logo=discord&logoColor=white"></a>
> Build, Run & Package Defold projects from Visual Studio Code

## Features
- `build`, `bundle`, `resolve`, `clean`, and `run`
- problemMatchers for task output
- colorized console output for enhanced readability
- sourcemap support for sourcemaps emitted from [TSTL](https://github.com/TypeScriptToLua/TypeScriptToLua)

## Requirements

Install the Defold editor and configure the `defold.editorPath` setting to point to the installation location of the editor.

## Quick Start

Open the command pallette with `⌘ + shift + p` or `ctrl + shift + p`

`> Tasks: Run Task` - Then selecting `defold`, followed by  `build`, `bundle`, `resolve`, `clean`, or `run` will execute the single task with the default task configuration.

`> Tasks: Configure Default Build Task` - Then selecting `defold`, followed by `build`, `bundle`, `resolve`, `clean`, or `run` will create or update a tasks.json file where you can provide further customization to the task. This will also bind the default task to the build hotkey `⌘ + shift + b` or `ctrl + shift + b`

You can always fully define your own tasks using any of the tasks that the `defold` task provider provides.

```json
{
  "type": "defold",
  "label": "build",
  "detail": "Build the defold game project",
  "action": "build",
  "configuration": "debug",
  "platform": "current",
  "group": {
    "kind": "build",
    "isDefault": true
  },
  "presentation": {
    "echo": true,
    "reveal": "always",
    "focus": true,
    "panel": "dedicated",
    "showReuseMessage": false,
    "clear": false
  },
  "problemMatcher": [
    "$defold-build"
  ],
  "dependsOn": [
    "compile"
  ],
}
```

## Extension Settings

#### Defold

* `defold.editorPath`: Path to the Defold Editor, will attempt to infer path if this is not set

#### Build

* `defold.build.email`: Email address for Bob to use when logging in
* `defold.build.auth`: Auth token for Bob to use when logging in
* `defold.build.textureCompression`: Use texture compression as specified in texture profiles
* `defold.build.withSymbols`: Use symbols when building the project

#### Bundle

* `defold.bundle.liveUpdate`: Should LiveUpdate content be published

#### iOS

* `defold.bundle.ios.identity`: The name of the iOS signing identity to use when building the project
* `defold.bundle.ios.mobileProvisioningProfilePath`: The path to the mobile provisioning profile to use when building the project

#### Android

* `defold.bundle.android.keystore`: The path to the Android keystore to use when building the project
* `defold.bundle.android.keystorePass`: The password for the Android keystore to use when building the project
* `defold.bundle.android.keystoreAlias`: The alias for the Android keystore to use when building the project
* `defold.bundle.android.bundleFormat`: The Android bundle format to use when building the project

## Release Notes

### 0.1.4 - 2021-10-6
- Update problem matcher to catch native extension errors from build

### 0.1.3 - 2021-10-6
- Fix run task bug on Windows when project uses native extensions

### 0.1.2 - 2021-10-6
- Fix run task on Windows

### 0.1.1 - 2021-10-05
- Notifications to remind you to configure the extensions in settings
- Better Default task provider defaults

### 0.1.0 - 2021-10-05
- Initial release

<p align="center" class="h4">
  TypeScript ❤️ Defold
</p>
