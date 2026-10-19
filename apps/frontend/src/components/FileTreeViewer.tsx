import { useState } from 'react';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileNode[];
  status?: 'modified' | 'added' | 'unmodified';
  lines?: number;
  content?: string;
}

const PROJECT_TREE: FileNode[] = [
  {
    name: 'apps',
    path: 'apps',
    type: 'dir',
    children: [
      {
        name: 'backend',
        path: 'apps/backend',
        type: 'dir',
        children: [
          {
            name: 'src',
            path: 'apps/backend/src',
            type: 'dir',
            children: [
              {
                name: 'routes',
                path: 'apps/backend/src/routes',
                type: 'dir',
                children: [
                  {
                    name: 'tasks.test.ts',
                    path: 'apps/backend/src/routes/tasks.test.ts',
                    type: 'file',
                    status: 'modified',
                    lines: 48,
                    content: `import { describe, expect, it } from 'vitest';
import { buildApp } from '../app';

describe('POST /tasks rate limit verification', () => {
  it('rejects rapid consecutive requests with 429', async () => {
    const app = buildApp();
    // Verify threshold trigger
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { instruction: 'fix checkout gate' },
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });

    expect(res.statusCode).toBe(429);
  });
});`,
                  },
                ],
              },
              {
                name: 'app.ts',
                path: 'apps/backend/src/app.ts',
                type: 'file',
                status: 'unmodified',
                lines: 160,
                content: `import Fastify from 'fastify';\n\nexport function buildApp() {\n  const app = Fastify();\n  // ...\n  return app;\n}`,
              },
              {
                name: 'github',
                path: 'apps/backend/src/github',
                type: 'dir',
                children: [
                  {
                    name: 'repos.ts',
                    path: 'apps/backend/src/github/repos.ts',
                    type: 'file',
                    status: 'modified',
                    lines: 92,
                    content: `export async function configureGitUser(sandbox) {\n  const botEmail = '344046298+orion-coding-agent[bot]@users.noreply.github.com';\n  await sandbox.runCommand('git config user.name "orion-coding-agent[bot]"');\n  await sandbox.runCommand(\`git config user.email "\${botEmail}"\`);\n}`,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'ORION_VERIFICATION.md',
    path: 'ORION_VERIFICATION.md',
    type: 'file',
    status: 'added',
    lines: 7,
    content: `# Orion Coding Agent Verification

- Task: Fix checkout rate-limit test
- Sandbox: Docker (orion-sandbox)
- Author: 344046298+orion-coding-agent[bot]
- Status: Verified (34/34 passing)
- PR: #142 against main`,
  },
  {
    name: 'package.json',
    path: 'package.json',
    type: 'file',
    status: 'unmodified',
    lines: 32,
    content: `{\n  "name": "cloud-agent",\n  "version": "0.0.0",\n  "private": true\n}`,
  },
];

export default function FileTreeViewer() {
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(['apps', 'apps/backend', 'apps/backend/src', 'apps/backend/src/routes']),
  );

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => {
      const isDir = node.type === 'dir';
      const isExpanded = expandedDirs.has(node.path);

      if (isDir) {
        return (
          <div key={node.path} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggleDir(node.path)}
              className="flex items-center gap-1.5 rounded-control px-2 py-1 text-left text-ink-2 transition-colors hover:bg-hover hover:text-ink"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-ink-3 transition-transform"
                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="truncate font-mono text-[11.5px] font-medium">{node.name}</span>
            </button>
            {isExpanded && node.children && (
              <div className="flex flex-col">{renderTree(node.children, depth + 1)}</div>
            )}
          </div>
        );
      }

      const isSelected = selectedFile?.path === node.path;
      return (
        <button
          key={node.path}
          type="button"
          onClick={() => setSelectedFile(node)}
          className={`flex items-center justify-between rounded-control px-2 py-1 text-left transition-colors ${
            isSelected
              ? 'bg-surface shadow-btn text-ink'
              : 'text-ink-2 hover:bg-hover hover:text-ink'
          }`}
          style={{ paddingLeft: `${depth * 12 + 20}px` }}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="truncate font-mono text-[11.5px]">{node.name}</span>
          </div>
          {node.status === 'modified' && (
            <span className="font-mono text-[10px] text-accent">M</span>
          )}
          {node.status === 'added' && (
            <span className="font-mono text-[10px] text-green font-semibold">+A</span>
          )}
        </button>
      );
    });
  };

  return (
    <div className="flex h-full flex-col p-3">
      {selectedFile ? (
        /* File content view */
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line bg-field/60 px-3 py-2">
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-2 hover:bg-hover hover:text-ink"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Back to tree</span>
            </button>
            <span className="truncate font-mono text-[11px] text-ink-3">{selectedFile.path}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-[1.6] select-text">
            <pre className="whitespace-pre-wrap text-ink font-mono">
              {selectedFile.content || '(empty file)'}
            </pre>
          </div>
        </div>
      ) : (
        /* File tree view */
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-3">
              Workspace Files
            </span>
            <span className="font-mono text-[10.5px] text-ink-3">/workspace</span>
          </div>
          <div className="flex flex-col gap-0.5">{renderTree(PROJECT_TREE)}</div>
        </div>
      )}
    </div>
  );
}
