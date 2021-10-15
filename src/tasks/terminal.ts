import { dirname, join, basename, relative, extname, sep } from 'path';
import { ChildProcessWithoutNullStreams, spawn, execSync } from 'child_process';
import { mkdirSync, existsSync, copyFileSync, rmSync, chmodSync, readFileSync, readdirSync } from 'fs';
import { platform, homedir } from 'os';
import * as _chalk from 'chalk';
import * as readline from 'readline';
import * as vscode from 'vscode';
import { SourceMapConsumer } from 'source-map-js';
import type { DefoldBuildTaskDefinition, DefoldTaskEnv, ExtManifest } from '../types';
import { editorPathError } from '../util/notifications';
import output from '../util/output';
import escape from '../util/escape';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require('../../package.json') as ExtManifest;

const HOST: Record<NodeJS.Platform, DefoldBuildTaskDefinition['platform']> = {
  darwin: 'macOS',
  win32: 'windows',
  cygwin: 'windows',
  linux: 'linux',
  aix: 'linux',
  freebsd: 'linux',
  sunos: 'linux',
  openbsd: 'linux',
  netbsd: 'linux',
  android: 'android',
};

const PLATFORMS: Record<DefoldBuildTaskDefinition['platform'], string> = {
  current: '',
  android: 'armv7-android',
  ios: 'armv7-darwin',
  macOS: 'x86_64-darwin',
  windows: 'x86_64-win32',
  linux: 'x86_64-linux',
  html5: 'js-web',
};

function getDefoldTaskEnv(): DefoldTaskEnv {
  // Resolve the editor path from the configuration settings
  const settings = vscode.workspace.getConfiguration('defold');
  let editorPath = settings.get<string>('editorPath');
  if (!editorPath) {
    output().appendLine('The `defold.editorPath` key is empty in the user and workspace settings.');
    return null;
  }

  // Resolve ~ in path
  if (editorPath && editorPath.startsWith('~'))
    editorPath = join(process.env.HOME || homedir() || '', editorPath.slice(1));

  // Ensure we root the incoming path
  if (editorPath.endsWith(sep)) dirname(join(editorPath, '.'));

  // Resolve editor path per platform
  switch (platform()) {
    case 'win32': {
      if (editorPath && extname(editorPath) === '.exe') editorPath = dirname(editorPath);
      break;
    }
    case 'darwin': {
      if (editorPath && !editorPath.endsWith('/Contents/Resources'))
        editorPath = join(editorPath, 'Contents/Resources');
      break;
    }
  }
  output().appendLine(`Resolved editor path: ${editorPath}`);

  // Check to see if the directory provided is the right shape
  let [hasDefold, hasConfig] = ['', ''];
  readdirSync(editorPath).forEach((file) => {
    if (file.toLowerCase() === 'config') hasConfig = file;
    if (file.toLowerCase() === 'packages') {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      readdirSync(join(editorPath!, file)).forEach((file) => {
        if (/defold.*\.jar$/i.exec(file) !== null) hasDefold = file;
      });
    }
  });
  if (!hasDefold || !hasConfig) {
    output().appendLine(`Editor path is not the correct shape...`);
    output().appendLine(`\thasDefold: "${hasDefold}", hasConfig: "${hasConfig}"`);
    return null;
  }

  // Parse the Defold Editor config file for the java, jdk, and defold jar
  const editorConfigPath = join(editorPath, hasConfig);
  const editorConfig = readFileSync(editorConfigPath, 'utf8');
  const lines = editorConfig.split('\n');
  const config: Record<string, string> = {};
  for (const line of lines) {
    const parts = line.split(/\s*=\s*/);
    if (parts.length === 2) config[parts[0]] = parts[1];
  }

  let env: DefoldTaskEnv = null;
  try {
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    env = {
      editorPath,
      version: config['version']!,
      editorSha1: config['editor_sha1']!,
      jdk: join(editorPath, config['jdk']!.replace('${bootstrap.resourcespath}', config['resourcespath'])),
      java: config['java']!.replace(
        '${launcher.jdk}',
        join(editorPath, config['jdk']!.replace('${bootstrap.resourcespath}', config['resourcespath']))
      ),
      jar: join(
        editorPath,
        config['jar']!.replace('${bootstrap.resourcespath}', config['resourcespath']).replace(
          '${build.editor_sha1}',
          config['editor_sha1']
        )
      ),
    };
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  } catch (e) {
    const error = e as Error;
    output().appendLine(`Failed to parse editor config file...`);
    output().appendLine(`\t${error.message}`);
    return null;
  }

  return env;
}

export class DefoldTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;

  private closeEmitter = new vscode.EventEmitter<number>();
  onDidClose?: vscode.Event<number> = this.closeEmitter.event;

  private process: ChildProcessWithoutNullStreams | null = null;
  private sourceMaps: Record<string, SourceMapConsumer> = {};
  private chalk = new _chalk.Instance({ level: 3 });

  constructor(
    private workspaceRoot: string,
    private project: string,
    private definition: DefoldBuildTaskDefinition,
    private env = getDefoldTaskEnv()
  ) {}

  open(_initialDimensions: vscode.TerminalDimensions | undefined): void {
    this.env = this.env ?? getDefoldTaskEnv();
    if (!this.env) {
      editorPathError();
      this.writeEmitter.fire(this.chalk.red('Could not find a valid path to the Defold Editor.') + '\r\n');
      this.closeEmitter.fire(1);
      return;
    }

    //* https://defold.com/manuals/bob/#usage
    const config = vscode.workspace.getConfiguration('defold');
    const projectDir = dirname(this.project);
    const target = this.definition.platform === 'current' ? HOST[platform()] : this.definition.platform;
    const java = `${this.env.java}`;
    const required = [
      `-cp`,
      `${this.env.jar}`,
      `com.dynamo.bob.Bob`,
      `-i`,
      escape(projectDir),
      `-r`,
      escape(projectDir),
      `--exclude-build-folder`,
      `.git, build`,
    ];

    let exec = java;
    let options: string[] = [];
    let commands: string[] = [];
    let cwd = this.workspaceRoot;

    switch (this.definition.action) {
      case 'build':
        {
          options = [
            ...required,
            `-e`,
            `${config.get<string>('build.email') ?? ''}`,
            `-u`,
            `${config.get<string>('build.auth') ?? ''}`,
            `-tc`,
            `${config.get<boolean>('build.textureCompression', false) ? 'true' : 'false'}`,
            `--variant`,
            `${this.definition.configuration}`,
          ];
          if (config.get<boolean>('build.withSymbols', false)) options.push(`--with-symbols`);
          if (this.definition.configuration === 'release') options.push(`--strip-executable`);

          commands = [`resolve`, `build`];
        }
        break;
      case 'bundle':
        {
          const out = join(this.workspaceRoot, 'bundle', target);
          try {
            mkdirSync(out, { recursive: true });
          } catch (e) {
            /* ignore */
          }

          options = [
            ...required,
            `-e`,
            `${config.get<string>('build.email') ?? ''}`,
            `-u`,
            `${config.get<string>('build.auth') ?? ''}`,
            `-a`,
            `-p`,
            `${PLATFORMS[target]}`,
            `-bo`,
            `${escape(out)}`,
            `-brhtml`,
            `${escape(join(out, 'build-report.html'))}`,
            `--variant`,
            `${this.definition.configuration}`,
          ];
          if (config.get<boolean>('build.withSymbols', false)) options.push(`--with-symbols`);
          if (this.definition.configuration === 'release') options.push(`--strip-executable`);
          if (config.get<boolean>('bundle.liveUpdate', false)) options.push(`-l`, `yes`);

          // Mobile bundle options
          if (target === 'ios') {
            const identity = config.get<string>('bundle.ios.identity', '');
            const mobileProvisioningProfilePath = config.get<string>('bundle.ios.mobileProvisioningProfilePath', '');
            if (identity) options.push(`--identity`, identity);
            if (mobileProvisioningProfilePath) options.push(`-mp`, escape(mobileProvisioningProfilePath));
          } else if (target === 'android') {
            const keystore = config.get<string>('bundle.android.keystore', '');
            const keystorePassword = config.get<string>('bundle.android.keystorePass', '');
            const keystoreAlias = config.get<string>('bundle.android.keystoreAlias', '');
            const bundleFormat = config.get<string>('bundle.android.bundleFormat', 'apk');
            if (keystore) options.push(`--keystore`, escape(keystore));
            if (keystorePassword) options.push(`--keystore-pass`, keystorePassword);
            if (keystoreAlias) options.push(`--keystore-alias`, keystoreAlias);
            if (bundleFormat) options.push(`--bundle-format`, bundleFormat);
          }

          commands = [`resolve`, `distclean`, `build`, `bundle`];
        }
        break;
      case 'clean':
        {
          options = [...required];
          commands = [`distclean`];
        }
        break;
      case 'resolve':
        {
          options = [
            ...required,
            `-e`,
            `${config.get<string>('build.email') ?? ''}`,
            `-u`,
            `${config.get<string>('build.auth') ?? ''}`,
          ];
          commands = [`resolve`];
        }
        break;
      case 'run':
        {
          cwd = join(projectDir, 'build', 'default');
          exec = join(cwd, platform() === 'win32' ? 'dmengine.exe' : 'dmengine');
          options = [];
          commands = ['./game.projectc'];

          if (!existsSync(join(cwd, 'game.projectc'))) {
            this.writeEmitter.fire(
              this.chalk.yellow(`Missing 'game.projectc'. Did you forget to build before running?`) + '\r\n'
            );
            this.closeEmitter.fire(1);
            return;
          }
        }
        break;
    }

    // Run Prelaunch deps
    this.preLaunch();

    // Execute the command
    // TODO: ENV variables - https://github.com/defold/defold/blob/ef879961c127c1b1e533b87ce60423387f1ef190/editor/src/clj/editor/engine.clj#L269
    this.exec(exec, [...options, ...commands], cwd);
  }

  close(): void {
    this.process?.kill();
  }

  private preLaunch() {
    output().appendLine(`Pre-Launch...`);

    switch (this.definition.action) {
      case 'run':
        this.ensureEngine();
        break;
    }
  }

  private ensureEngine() {
    if (!this.env) return;

    const projectDir = dirname(this.project);
    const jar = join(this.env.jdk, 'bin', 'jar');

    let deps: string[] = [];
    switch (platform()) {
      case 'darwin':
        deps = ['_unpack/x86_64-darwin/bin/dmengine'];
        break;
      case 'win32':
        deps = [
          '_unpack/x86_64-win32/bin/dmengine.exe',
          `_unpack/x86_64-win32/bin/OpenAL32.dll`,
          `_unpack/x86_64-win32/bin/wrap_oal.dll`,
        ];
        break;
      default:
        deps = ['_unpack/x86_64-linux/bin/dmengine'];
        break;
    }

    // Extract the engine dependencies
    const out = join(projectDir, 'build', 'default');
    const path = deps[0];
    const archive = this.env.jar;

    const required = deps.filter((dep) => !existsSync(join(out, basename(dep))));
    if (required.length > 0) {
      output().appendLine(`Copying Dependencies...`);

      required.forEach((dep) => {
        execSync(`${jar} -xf ${escape(archive)} ${escape(dep)}`, { cwd: out });
        copyFileSync(join(out, dep), join(out, basename(dep)));
        output().appendLine(`-> ${basename(dep)}`);
      });

      rmSync(join(out, '_unpack'), { recursive: true, force: true });
      chmodSync(join(out, basename(path)), '755');
    }
  }

  private exec(command: string, args: string[], cwd?: string): void {
    // Spawn the incoming process
    output().appendLine(`Execute: ${command} ${args.join(' ')}`);
    this.process = spawn(command, args, { cwd: cwd ?? this.workspaceRoot });

    // Handle the process output
    const stdout = readline.createInterface({ input: this.process.stdout, historySize: 0 });
    stdout.on('line', (line) => this.decorateAndEmit('stdout', line.trim()));

    // Handle the process error
    const stderr = readline.createInterface({ input: this.process.stderr, historySize: 0 });
    stderr.on('line', (line) => this.decorateAndEmit('stderr', line.trim()));

    // Handle the process exit
    this.process.on('close', (code) => {
      this.closeEmitter.fire(code ?? 0);
    });
  }

  private decorateAndEmit(src: 'stdout' | 'stderr', line: string) {
    const write = (line: string) => this.writeEmitter.fire(line + '\r\n');

    for (const problemPattern of manifest.contributes.problemPatterns) {
      const regex = new RegExp(problemPattern.regexp);
      const match = regex.exec(line);
      if (match) {
        // Apply diagnostics to our output if it matches a problemPattern
        switch (problemPattern.name) {
          case 'defold-run-diagnostic':
          case 'defold-build-diagnostic': {
            const severity = match[problemPattern.severity];
            switch (severity.toLowerCase()) {
              case 'error': {
                const lineNum = match[problemPattern.line];
                const file = match[problemPattern.file];
                const filePath = join(dirname(this.project), file);

                // Apply sourcemaps and path remapping
                let remapped = false;
                if (parseInt(lineNum) > 0 && file) {
                  const sourceMapPath = `${filePath}.map`;
                  if (existsSync(sourceMapPath)) {
                    let sourceMap = this.sourceMaps[filePath];
                    if (!sourceMap) {
                      sourceMap = this.sourceMaps[filePath] = new SourceMapConsumer(
                        JSON.parse(readFileSync(sourceMapPath).toString())
                      );
                    }

                    const res = sourceMap.originalPositionFor({
                      line: parseInt(lineNum),
                      column: 0,
                    });
                    if (res.source) {
                      line = line.replace(
                        `${file}:${lineNum}`,
                        `${relative(this.workspaceRoot, res.source)}:${res.line}`
                      );
                      remapped = true;
                    }
                  }
                }
                if (!remapped) line = line.replace(file, relative(this.workspaceRoot, filePath));

                write(this.chalk.red(match[1]) + this.chalk.white(line.split(match[1])[1]));
                break;
              }
              case 'warning':
                write(this.chalk.yellow(match[1]) + this.chalk.white(line.split(match[1])[1]));
                break;
              case 'info':
                write(this.chalk.blueBright(match[1]) + this.chalk.white(line.split(match[1])[1]));
                break;
            }
            return;
          }
        }
      }
    }

    // default
    write(this.definition.action !== 'run' && src === 'stderr' ? this.chalk.red(line) : this.chalk.white(line));
  }
}
