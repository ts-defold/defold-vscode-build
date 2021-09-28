import * as vscode from 'vscode';
import { TaskProvider } from './tasks/provider';

let taskProvider: vscode.Disposable | undefined;

export function activate(_context: vscode.ExtensionContext): void {
  // TODO: TaskProvider should activate if we find a game.project file that looks
  // TODO: that looks like a defold game project.
  const workspaceRoot =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;
  if (!workspaceRoot) return;

  taskProvider = vscode.tasks.registerTaskProvider(TaskProvider.Type, new TaskProvider(workspaceRoot));
}

export function deactivate(): void {
  if (taskProvider) taskProvider.dispose();
}
