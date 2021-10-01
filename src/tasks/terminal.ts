import { dirname, join, basename, relative } from 'path';
import { ChildProcessWithoutNullStreams, spawn, execSync } from 'child_process';
import { mkdirSync, existsSync, copyFileSync, rmSync, chmodSync, readFileSync } from 'fs';
import { platform } from 'os';
import * as _chalk from 'chalk';
import * as readline from 'readline';
import * as vscode from 'vscode';
import { SourceMapConsumer } from 'source-map-js';
import type { DefoldBuildTaskDefinition, DefoldTaskEnv, ExtManifest } from '../types';
import output from '../output';

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
    private env: DefoldTaskEnv,
    private flags: string[]
  ) {}

  open(_initialDimensions: vscode.TerminalDimensions | undefined): void {
    // TODO: If we are here and have no env, what should we do?
    if (!this.env) {
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
      `--input`,
      `"${projectDir}"`,
      `--root`,
      `"${projectDir}"`,
      `--exclude-build-folder`,
      `.git, build`,
    ];

    let exec = java;
    let options: string[] = [];
    let commands: string[] = [];

    switch (this.definition.action) {
      case 'build':
        {
          options = [
            ...required,
            `--email`,
            `${config.get<string>('build.email') ?? ''}`,
            `--auth`,
            `${config.get<string>('build.auth') ?? ''}`,
            `--variant`,
            `${this.definition.configuration}`,
            this.definition.configuration === 'release' ? `--strip-executable` : '',
          ];
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
            `--email`,
            `${config.get<string>('build.email') ?? ''}`,
            `--auth`,
            `${config.get<string>('build.auth') ?? ''}`,
            `--archive`,
            `--platform`,
            `${PLATFORMS[target]}`,
            `--variant`,
            `${this.definition.configuration}`,
            this.definition.configuration === 'release' ? `--strip-executable` : '',
            `--bundle-output`,
            `"${out}"`,
            `--build-report-html`,
            `${join(out, 'build-report.html')}`,
          ];
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
            `--email`,
            `${config.get<string>('build.email') ?? ''}`,
            `--auth`,
            `${config.get<string>('build.auth') ?? ''}`,
          ];
          commands = [`resolve`];
        }
        break;
      case 'run':
        {
          const out = join(projectDir, 'build', 'default');
          exec = join(out, platform() === 'win32' ? 'dmengine.exe' : 'dmengine');
          options = [];
          commands = [join(out, 'game.projectc')];

          if (!existsSync(exec)) {
            this.writeEmitter.fire(`Build before running`);
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
    this.exec(exec, [...options, ...commands]);
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

    let path = '';
    switch (platform()) {
      case 'darwin':
        path = '_unpack/x86_64-darwin/bin/dmengine';
        break;
      case 'win32':
        path = '_unpack/x86_64-win32/bin/dmengine.exe';
        break;
      default:
        path = '_unpack/x86_64-linux/bin/dmengine';
        break;
    }

    // Extract the engine binary if one was not generated by the build
    const out = join(projectDir, 'build', 'default');
    if (!existsSync(join(out, basename(path)))) {
      output().appendLine(`Copying Dependencies...`);

      execSync(`${jar} -xf "${this.env.jar}" "${path}"`, { cwd: out });
      copyFileSync(join(out, path), join(out, basename(path)));
      rmSync(join(out, '_unpack'), { recursive: true, force: true });
      chmodSync(join(out, basename(path)), '755');
    }
  }

  private exec(command: string, args: string[]) {
    // Spawn the incoming process
    output().appendLine(`Execute: ${command} ${args.join(' ')}`);
    this.process = spawn(command, args, { cwd: this.workspaceRoot });

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
