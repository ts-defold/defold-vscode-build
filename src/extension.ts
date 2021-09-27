import * as vscode from 'vscode';
import { DefoldBuildTaskProvider } from './defoldBuildTaskProvider';

let defoldBuildTaskProvider: vscode.Disposable | undefined;

export function activate(_context: vscode.ExtensionContext): void {
  const workspaceRoot =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;
  if (!workspaceRoot) return;

  defoldBuildTaskProvider = vscode.tasks.registerTaskProvider(
    DefoldBuildTaskProvider.CustomBuildScriptType,
    new DefoldBuildTaskProvider(workspaceRoot)
  );
}

export function deactivate(): void {
  if (defoldBuildTaskProvider) defoldBuildTaskProvider.dispose();
}
