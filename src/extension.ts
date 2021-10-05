import * as vscode from 'vscode';
import output from './output';
import { TaskProvider } from './tasks/provider';

let taskProvider: vscode.Disposable | undefined;

export function activate(_context: vscode.ExtensionContext): void {
  const workspaceRoot =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;
  if (!workspaceRoot) return;

  // TODO: Notify to set the path to the Defold Editor

  // Register task provider if we are in a workspace with a game.project file
  vscode.workspace.findFiles('**/game.project', '**/node_modules/**', 1).then(
    (files) => {
      if (files.length > 0) {
        if (!taskProvider)
          taskProvider = vscode.tasks.registerTaskProvider('defold', new TaskProvider(workspaceRoot, files[0].fsPath));
      }
    },
    (_err) => {
      output().appendLine('Could not find game.project');
    }
  );
}

export function deactivate(): void {
  if (taskProvider) taskProvider.dispose();
}
