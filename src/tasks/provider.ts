import * as path from 'path';
import * as fs from 'fs';
import { platform } from 'os';
import * as vscode from 'vscode';

import output from '../output';
import { DefoldTerminal } from './terminal';
import type { DefoldBuildTaskDefinition, DefoldTaskEnv } from '../types';

function getDefoldTaskEnv(): DefoldTaskEnv {
  // Resolve the editor path from the configuration settings
  const settings = vscode.workspace.getConfiguration('defold');
  let editorPath = settings.get<string>('editorPath');
  if (!editorPath) return null;

  // Resolve editor path per platform
  switch (platform()) {
    case 'darwin':
      {
        if (editorPath && !editorPath.endsWith('/Contents/Resources'))
          editorPath = path.join(editorPath, 'Contents/Resources');
      }
      break;
  }

  // Parse the Defold Editor config file for the java, jdk, and defold jar
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

  constructor(private workspaceRoot: string, private project: string) {
    //* NOTES:
    //* Ensure we have an editor path set in the configuration, or attempt organic detection
    //* Parse the config file (Contents/Resources/config) for JDK path, defold jar, and vmargs
    //* Build up path to Bob the builder: `/path/to/jdk/bin/java -cp /path/to/defold/jar com.dynamo.bob.Bob`
    //* Look for a game.project file in the workspace root or any subfolder
    //* Provide tasks for ['clean', 'build', 'bundle', 'resolve']
    //* Run build through PsudeoTerminal and apply sourcemaps to errors / warnings

    const config = vscode.workspace.getConfiguration('defold');
    output().appendLine(`Workspace root: ${this.workspaceRoot}`);
    output().appendLine(`Config: ${JSON.stringify(config)}`);
  }

  /**
   * This is called by vscode when a list of tasks is requested from the command panel
   */
  public async provideTasks(): Promise<vscode.Task[]> {
    if (this.tasks !== undefined) return this.tasks;

    const env = getDefoldTaskEnv();
    this.tasks = ['build', 'bundle', 'clean', 'resolve', 'run'].map((flavor) => {
      return this.createTask(
        {
          action: flavor as DefoldBuildTaskDefinition['action'],
          type: TaskProvider.Type,
          configuration: 'debug',
          platform: 'current',
          flags: [],
        },
        env
      );
    });

    return this.tasks;
  }

  /**
   * This is called by vscode when a task is run from tasks.json
   * * This must return the task.definition that is passed in or it will not match
   */
  public resolveTask(task: vscode.Task): vscode.Task | undefined {
    const env = getDefoldTaskEnv();
    if (env) return this.createTask(task.definition as DefoldBuildTaskDefinition, env);

    return undefined;
  }

  private createTask(definition: DefoldBuildTaskDefinition, env: DefoldTaskEnv): vscode.Task {
    return new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.action,
      TaskProvider.Type,
      new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => {
        return new DefoldTerminal(this.workspaceRoot, this.project, definition, env, []);
      })
    );
  }
}
