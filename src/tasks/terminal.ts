import * as cp from 'child_process';
import * as vscode from 'vscode';

import type { DefoldBuildTaskDefinition, DefoldTaskEnv } from '../types';

export class CustomBuildTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  private closeEmitter = new vscode.EventEmitter<number>();
  onDidClose?: vscode.Event<number> = this.closeEmitter.event;

  constructor(
    private workspaceRoot: string,
    private project: string,
    private definition: DefoldBuildTaskDefinition,
    private env: DefoldTaskEnv,
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
