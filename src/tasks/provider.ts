import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';

let _channel: vscode.OutputChannel;
function getOutputChannel(): vscode.OutputChannel {
  if (!_channel) _channel = vscode.window.createOutputChannel('Defold Build');

  return _channel;
}

type DefoldTaskEnv = {
  editorPath: string;
  version: string;
  editorSha1: string;
  jdk: string;
  java: string;
  jar: string;
} | null;

function parseDefoldConfig(editorPath: string): DefoldTaskEnv {
  const editorConfigPath = path.join(editorPath, 'config');
  if (!fs.existsSync(editorConfigPath)) return null;

  const editorConfig = fs.readFileSync(editorConfigPath, 'utf8');
  const lines = editorConfig.split('\n');
  const config: Record<string, string> = {};
  for (const line of lines) {
    const parts = line.split(/\s*=\s*/);
    if (parts.length === 2) config[parts[0]] = parts[1];
  }

  /* eslint-disable @typescript-eslint/no-non-null-assertion */
  return {
    editorPath,
    version: config['version']!,
    editorSha1: config['editor_sha1']!,
    jdk: path.join(editorPath, config['jdk']!.replace('${bootstrap.resourcespath}', config['resourcespath'])),
    java: config['java']!.replace(
      '${launcher.jdk}',
      path.join(editorPath, config['jdk']!.replace('${bootstrap.resourcespath}', config['resourcespath']))
    ),
    jar: path.join(
      editorPath,
      config['jar']!.replace('${bootstrap.resourcespath}', config['resourcespath']).replace(
        '${build.editor_sha1}',
        config['editor_sha1']
      )
    ),
  };
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
}

interface DefoldBuildTaskDefinition extends vscode.TaskDefinition {
  action: 'build' | 'bundle' | 'clean' | 'resolve';
  configuration: 'debug' | 'release';
  platform: 'current' | 'android' | 'ios' | 'macOS' | 'windows' | 'linux' | 'html5';
}

export class TaskProvider implements vscode.TaskProvider {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  static Type = 'defold';
  private tasks: vscode.Task[] | undefined;

  // We use a CustomExecution task when state needs to be shared accross runs of the task or when
  // the task requires use of some VS Code API to run.
  // If you don't need to share state between runs and if you don't need to execute VS Code API in your task,
  // then a simple ShellExecution or ProcessExecution should be enough.
  // Since our build has this shared state, the CustomExecution is used below.
  private sharedState: string | undefined;

  constructor(private workspaceRoot: string) {
    //* NOTES:
    //* Ensure we have an editor path set in the configuration, or attempt organic detection
    //* Parse the config file (Contents/Resources/config) for JDK path, defold jar, and vmargs
    //* Build up path to Bob the builder: `/path/to/jdk/bin/java -cp /path/to/defold/jar com.dynamo.bob.Bob`
    //* Look for a game.project file in the workspace root or any subfolder
    //* Provide tasks for ['clean', 'build', 'bundle', 'resolve']
    //* Run build through PsudeoTerminal and apply sourcemaps to errors / warnings

    const config = vscode.workspace.getConfiguration('defold');
    getOutputChannel().appendLine(`Workspace root: ${this.workspaceRoot}`);
    getOutputChannel().appendLine(`Config: ${JSON.stringify(config)}`);
  }

  /**
   * This is called by vscode when a list of tasks is requested from the command panel
   */
  public async provideTasks(): Promise<vscode.Task[]> {
    if (this.tasks !== undefined) return this.tasks;

    this.tasks = ['build', 'bundle', 'clean', 'resolve'].map((flavor) => {
      return this.createTask(
        {
          action: flavor as DefoldBuildTaskDefinition['action'],
          type: TaskProvider.Type,
          configuration: 'debug',
          platform: 'current',
          flags: [],
        },
        null
      );
    });

    return this.tasks;
  }

  /**
   * This is called by vscode when a task is run from tasks.json
   * * This must return the task.definition that is passed in or it will not match
   */
  public resolveTask(task: vscode.Task): vscode.Task | undefined {
    // Resolve the editor path from the config
    const config = vscode.workspace.getConfiguration('defold');
    let editorPath = config.get<string>('editorPath');
    if (editorPath) {
      switch (os.platform()) {
        case 'darwin':
          {
            if (editorPath && !editorPath.endsWith('/Contents/Resources'))
              editorPath = path.join(editorPath, 'Contents/Resources');
          }
          break;
      }

      // Parse the Defold Editor config file for the java, jdk, and defold jar
      if (editorPath && fs.existsSync(editorPath)) {
        const env = parseDefoldConfig(editorPath);
        if (env) return this.createTask(task.definition as DefoldBuildTaskDefinition, env);
      }
    }

    // If we get here, we couldn't resolve the editor path
    void vscode.window.showErrorMessage('Please set the Defold Editor Path in your user or workspace settings.');

    return undefined;
  }

  private createTask(definition: DefoldBuildTaskDefinition, _env: DefoldTaskEnv): vscode.Task {
    return new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.action,
      TaskProvider.Type,
      new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => {
        // When the task is executed, this callback will run. Here, we setup for running the task.
        return new CustomBuildTaskTerminal(
          this.workspaceRoot,
          definition.action,
          [],
          () => this.sharedState,
          (state: string) => (this.sharedState = state)
        );
      })
    );
  }
}

class CustomBuildTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  private closeEmitter = new vscode.EventEmitter<number>();
  onDidClose?: vscode.Event<number> = this.closeEmitter.event;

  constructor(
    private workspaceRoot: string,
    private flavor: string,
    private flags: string[],
    private getSharedState: () => string | undefined,
    private setSharedState: (state: string) => void
  ) {}

  open(_initialDimensions: vscode.TerminalDimensions | undefined): void {
    void this.doBuild();
  }

  close(): void {
    // empty
  }

  private async doBuild(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.writeEmitter.fire('Starting build...\r\n');
      let isIncremental = this.flags.indexOf('incremental') > -1;
      if (isIncremental) {
        if (this.getSharedState()) {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          this.writeEmitter.fire(`Using last build results: ${this.getSharedState()}\r\n`);
        } else {
          isIncremental = false;
          this.writeEmitter.fire('No result from last build. Doing full build.\r\n');
        }
      }

      // Since we don't actually build anything in this example set a timeout instead.
      setTimeout(
        () => {
          const date = new Date();
          this.setSharedState(date.toTimeString() + ' ' + date.toDateString());
          this.writeEmitter.fire('Build complete.\r\n\r\n');
          if (this.flags.indexOf('watch') === -1) {
            this.closeEmitter.fire(0);
            resolve();
          }
        },
        isIncremental ? 1000 : 4000
      );
    });
  }
}
