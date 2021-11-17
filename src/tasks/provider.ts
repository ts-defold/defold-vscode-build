import * as vscode from 'vscode';

import output from '../util/output';
import { DefoldTerminal } from './terminal';
import type { DefoldBuildTaskDefinition } from '../types';

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

    const detail = {
      build: 'Build the project for running, debugging or testing',
      bundle: 'Bundle the project for a specific platform',
      clean: 'Clean the project output',
      resolve: 'Resolve the project dependencies',
      run: 'Run the project',
    };
    this.tasks = ['build', 'bundle', 'clean', 'resolve', 'run'].map((flavor) => {
      const definition: DefoldBuildTaskDefinition = {
        action: flavor as DefoldBuildTaskDefinition['action'],
        type: TaskProvider.Type,
        configuration: 'debug',
        platform: 'current',
      };
      const task = new vscode.Task(
        definition,
        vscode.TaskScope.Workspace,
        flavor,
        TaskProvider.Type,
        this.createExecution(definition),
        flavor === 'run' ? '$defold-run' : '$defold-build'
      );
      task.detail = detail[flavor as keyof typeof detail];
      task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        echo: true,
        focus: true,
        panel: vscode.TaskPanelKind.Dedicated,
        showReuseMessage: false,
        clear: false,
      };
      return task;
    });

    return this.tasks;
  }

  /**
   * This is called by vscode when a task is run from tasks.json
   * * This must return the task.definition that is passed in or it will not match
   */
  public resolveTask(task: vscode.Task): vscode.Task | undefined {
    const definition = task.definition as DefoldBuildTaskDefinition;
    const t = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.action,
      TaskProvider.Type,
      this.createExecution(task.definition as DefoldBuildTaskDefinition),
      definition.action === 'run' ? '$defold-run' : '$defold-build'
    );
    return t;
  }

  private createExecution(definition: DefoldBuildTaskDefinition): vscode.CustomExecution {
    return new vscode.CustomExecution(async (resolvedDefinition): Promise<vscode.Pseudoterminal> => {
      return new DefoldTerminal(this.workspaceRoot, this.project, { ...resolvedDefinition, ...definition });
    });
  }
}
