import type { TabFile } from '../components/VSCodeIDE';

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  children: FileTreeNode[];
  file?: TabFile;
}

/**
 * Builds a hierarchical directory tree from a flat list of TabFiles.
 * Automatically sorts directories before files, and alphabetical within each type.
 */
export function buildFileTree(files: TabFile[]): FileTreeNode[] {
  const root: FileTreeNode = {
    id: 'root',
    name: 'root',
    path: '',
    isDir: true,
    children: [],
  };

  for (const file of files) {
    if (file.isWelcome || file.path === 'welcome') continue;
    
    // Normalize path: remove leading / or ./
    const cleanPath = file.path.replace(/^\.?\//, '');
    if (!cleanPath) continue;

    const parts = cleanPath.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      let existing = current.children.find((c) => c.name === part);
      if (!existing) {
        const newNode: FileTreeNode = {
          id: currentPath,
          name: part,
          path: currentPath,
          isDir: !isLast,
          children: [],
          file: isLast ? { ...file, path: currentPath } : undefined,
        };
        current.children.push(newNode);
        existing = newNode;
      } else if (isLast) {
        existing.file = { ...file, path: currentPath };
      }
      current = existing;
    }
  }

  function sortNodes(nodes: FileTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    for (const node of nodes) {
      if (node.isDir && node.children.length > 0) {
        sortNodes(node.children);
      }
    }
  }

  sortNodes(root.children);
  return root.children;
}

/**
 * Collects paths of top-level directories to expand by default on initial load.
 */
export function getDefaultExpandedDirs(nodes: FileTreeNode[], maxDepth = 2, currentDepth = 0): Set<string> {
  const expanded = new Set<string>();
  if (currentDepth >= maxDepth) return expanded;

  for (const node of nodes) {
    if (node.isDir) {
      expanded.add(node.path);
      const sub = getDefaultExpandedDirs(node.children, maxDepth, currentDepth + 1);
      for (const p of sub) {
        expanded.add(p);
      }
    }
  }
  return expanded;
}

/**
 * Returns language mode and file icon metadata for a given file name or path.
 */
export function getFileMeta(fileNameOrPath: string): {
  iconType: string;
  badge: string;
  color: string;
  lang: string;
} {
  const lower = fileNameOrPath.toLowerCase();

  if (lower.endsWith('.tsx')) {
    return { iconType: 'tsx', badge: 'TSX', color: '#3178c6', lang: 'typescript' };
  }
  if (lower.endsWith('.ts')) {
    return { iconType: 'ts', badge: 'TS', color: '#3178c6', lang: 'typescript' };
  }
  if (lower.endsWith('.jsx')) {
    return { iconType: 'jsx', badge: 'JSX', color: '#f7df1e', lang: 'javascript' };
  }
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return { iconType: 'js', badge: 'JS', color: '#f7df1e', lang: 'javascript' };
  }
  if (lower.endsWith('.json')) {
    return { iconType: 'json', badge: '{}', color: '#fbc02d', lang: 'json' };
  }
  if (lower.endsWith('.md')) {
    return { iconType: 'md', badge: 'M↓', color: '#42a5f5', lang: 'markdown' };
  }
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less')) {
    return { iconType: 'css', badge: '#', color: '#264de4', lang: 'css' };
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return { iconType: 'html', badge: '<>', color: '#e44d26', lang: 'html' };
  }
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return { iconType: 'yaml', badge: '!', color: '#cb171e', lang: 'yaml' };
  }
  if (lower.endsWith('.svg') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.ico')) {
    return { iconType: 'image', badge: 'IMG', color: '#a074c4', lang: 'plaintext' };
  }
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) {
    return { iconType: 'shell', badge: '$_', color: '#4caf50', lang: 'shell' };
  }
  if (lower.endsWith('.lock') || lower.includes('lock')) {
    return { iconType: 'lock', badge: '🔒', color: '#888888', lang: 'plaintext' };
  }
  if (lower === 'dockerfile' || lower.endsWith('.dockerfile')) {
    return { iconType: 'docker', badge: '🐳', color: '#2496ed', lang: 'dockerfile' };
  }
  if (lower.startsWith('.git')) {
    return { iconType: 'git', badge: '⎇', color: '#f05032', lang: 'plaintext' };
  }
  if (lower.startsWith('.env')) {
    return { iconType: 'env', badge: '⚙', color: '#ecd53f', lang: 'plaintext' };
  }

  return { iconType: 'file', badge: '📄', color: '#858585', lang: 'plaintext' };
}
