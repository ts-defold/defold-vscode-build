import * as vscode from 'vscode';

let _channel: vscode.OutputChannel;

export default function get(): vscode.OutputChannel {
  if (!_channel) _channel = vscode.window.createOutputChannel('Defold Build');

  return _channel;
}
