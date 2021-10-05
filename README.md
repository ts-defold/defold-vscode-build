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

Users appreciate release notes as you update your extension.

### 0.0.0

Pending initial release

<p align="center" class="h4">
  TypeScript :heart: Defold
</p>
