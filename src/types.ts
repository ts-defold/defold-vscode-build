import type { TaskDefinition } from 'vscode';

export type DefoldTaskEnv = {
  editorPath: string;
  version: string;
  editorSha1: string;
  jdk: string;
  java: string;
  jar: string;
} | null;

export interface DefoldBuildTaskDefinition extends TaskDefinition {
  action: 'build' | 'bundle' | 'clean' | 'resolve' | 'run';
  configuration: 'debug' | 'release';
  platform: 'current' | 'android' | 'ios' | 'macOS' | 'windows' | 'linux' | 'html5';
}

export type ExtManifest = {
  contributes: {
    problemPatterns: {
      name: string;
      regexp: string;
      severity: number;
      file: number;
      line: number;
      message: number;
    }[];
  };
};
