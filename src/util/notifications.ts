import * as vscode from 'vscode';

export function editorPathInfo(): void {
  void vscode.window
    .showInformationMessage('Please configure the path to the Defold Editor in your user or workspace settings', {
      title: 'Open Settings',
      id: 'settings',
    })
    .then((result) => {
      if (result?.id === 'settings')
        void vscode.commands.executeCommand('workbench.action.openSettings', 'defold.editorPath');
    });
}

export function editorPathError(): void {
  void vscode.window
    .showErrorMessage(
      'The Defold Editor path can not be determined! Check the path to make sure it exists and is configured in your user or workspace settings.',
      {
        title: 'Open Settings',
        id: 'settings',
      }
    )
    .then((result) => {
      if (result?.id === 'settings')
        void vscode.commands.executeCommand('workbench.action.openSettings', 'defold.editorPath');
    });
}
