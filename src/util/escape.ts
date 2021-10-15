import { platform } from 'os';

export default function escape(path: string): string {
  switch (platform()) {
    case 'win32':
      return `"${path}"`;
    default:
      return path.replace(/(\s+)/g, '\\$1');
  }
}
