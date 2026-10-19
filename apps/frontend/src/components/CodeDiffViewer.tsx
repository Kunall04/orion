import { useState } from 'react';

export interface FileDiffItem {
  file: string;
  add: number;
  del: number;
  status: 'modified' | 'added' | 'deleted';
  hunks: Array<{
    header: string;
    lines: Array<{
      oldNo?: number;
      newNo?: number;
      type: 'ctx' | 'add' | 'del';
      text: string;
    }>;
  }>;
}

const DEFAULT_DIFFS: FileDiffItem[] = [
  {
    file: 'src/routes/tasks.test.ts',
    add: 4,
    del: 2,
    status: 'modified',
    hunks: [
      {
        header: '@@ -26,8 +26,10 @@ describe("POST /tasks rate limit")',
        lines: [
          { oldNo: 26, newNo: 26, type: 'ctx', text: '    const res = await app.inject({' },
          { oldNo: 27, newNo: 27, type: 'ctx', text: '      method: "POST",' },
          { oldNo: 28, newNo: 28, type: 'ctx', text: '      url: "/tasks",' },
          { oldNo: 29, type: 'del', text: '-     payload: { instruction: "test" },' },
          { oldNo: 30, type: 'del', text: '-     // Expected 200 without rate limiter' },
          { newNo: 29, type: 'add', text: '+     payload: { instruction: "fix checkout gate" },' },
          { newNo: 30, type: 'add', text: '+     headers: { "x-forwarded-for": "10.0.0.1" },' },
          { newNo: 31, type: 'add', text: '+   });' },
          { newNo: 32, type: 'add', text: '+   expect(res.statusCode).toBe(429);' },
          { oldNo: 31, newNo: 33, type: 'ctx', text: '  });' },
        ],
      },
    ],
  },
  {
    file: 'ORION_VERIFICATION.md',
    add: 7,
    del: 0,
    status: 'added',
    hunks: [
      {
        header: '@@ -0,0 +1,7 @@',
        lines: [
          { newNo: 1, type: 'add', text: '+# Orion Coding Agent Verification' },
          { newNo: 2, type: 'add', text: '+' },
          { newNo: 3, type: 'add', text: '+- Task: Fix checkout rate-limit test' },
          { newNo: 4, type: 'add', text: '+- Sandbox: Docker (orion-sandbox)' },
          { newNo: 5, type: 'add', text: '+- Author: 344046298+orion-coding-agent[bot]' },
          { newNo: 6, type: 'add', text: '+- Status: Verified (34/34 passing)' },
          { newNo: 7, type: 'add', text: '+- PR: #142 against main' },
        ],
      },
    ],
  },
  {
    file: 'apps/backend/src/github/repos.ts',
    add: 3,
    del: 1,
    status: 'modified',
    hunks: [
      {
        header: '@@ -82,3 +82,5 @@ export async function configureGitUser()',
        lines: [
          { oldNo: 82, newNo: 82, type: 'ctx', text: '  await sandbox.runCommand("git config user.name \\"orion-coding-agent[bot]\\""' },
          { oldNo: 83, type: 'del', text: '- await sandbox.runCommand("git config user.email \\"bot@noreply.github.com\\"");' },
          { newNo: 83, type: 'add', text: '+ const botEmail = "344046298+orion-coding-agent[bot]@users.noreply.github.com";' },
          { newNo: 84, type: 'add', text: '+ await sandbox.runCommand(`git config user.email "${botEmail}"`);' },
          { oldNo: 84, newNo: 85, type: 'ctx', text: '}' },
        ],
      },
    ],
  },
];

export default function CodeDiffViewer({
  files = DEFAULT_DIFFS,
}: {
  files?: FileDiffItem[];
}) {
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const activeFile = files[selectedFileIdx] || files[0]!;

  const totalAdd = files.reduce((acc, f) => acc + f.add, 0);
  const totalDel = files.reduce((acc, f) => acc + f.del, 0);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Overview header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-semibold text-ink">
            {files.length} changed file{files.length === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums">
            <span className="text-green font-medium">+{totalAdd}</span>
            <span className="text-red font-medium">−{totalDel}</span>
          </span>
        </div>
      </div>

      {/* File selector pills */}
      <div className="flex flex-col gap-1">
        {files.map((f, idx) => (
          <button
            key={f.file}
            type="button"
            onClick={() => setSelectedFileIdx(idx)}
            className={`flex items-center justify-between rounded-control px-2.5 py-1.5 text-left transition-all ${
              selectedFileIdx === idx
                ? 'bg-surface shadow-btn text-ink'
                : 'text-ink-2 hover:bg-hover hover:text-ink'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="truncate font-mono text-[11.5px]">{f.file}</span>
            </div>
            <span className="shrink-0 font-mono text-[10.5px] tabular-nums">
              <span className="text-green">+{f.add}</span>
              {f.del > 0 && <span className="text-red ml-1">−{f.del}</span>}
            </span>
          </button>
        ))}
      </div>

      {/* Code diff container */}
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {/* File header bar */}
        <div className="flex items-center justify-between border-b border-line bg-field/60 px-3 py-2">
          <span className="truncate font-mono text-[11px] font-medium text-ink">
            {activeFile.file}
          </span>
          <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-3 border border-line">
            {activeFile.status}
          </span>
        </div>

        {/* Hunk lines */}
        <div className="overflow-x-auto py-1 font-mono text-[11px] leading-[1.7]">
          {activeFile.hunks.map((hunk, hIdx) => (
            <div key={hIdx}>
              <div className="bg-field/40 px-3 py-0.5 text-[10.5px] text-ink-3 font-semibold select-none border-y border-line/40">
                {hunk.header}
              </div>
              {hunk.lines.map((line, lIdx) => {
                const isAdd = line.type === 'add';
                const isDel = line.type === 'del';
                return (
                  <div
                    key={lIdx}
                    className={`flex items-start px-2 py-0.2 hover:bg-hover/60 ${
                      isAdd
                        ? 'bg-green-tint text-green'
                        : isDel
                          ? 'bg-red-tint text-red'
                          : 'text-ink-2'
                    }`}
                  >
                    {/* Line numbers */}
                    <span className="w-6 shrink-0 select-none text-right text-[10px] text-ink-3 opacity-60 mr-2">
                      {line.oldNo ?? ''}
                    </span>
                    <span className="w-6 shrink-0 select-none text-right text-[10px] text-ink-3 opacity-60 mr-3">
                      {line.newNo ?? ''}
                    </span>
                    {/* Prefix */}
                    <span className="w-3 shrink-0 select-none font-bold">
                      {isAdd ? '+' : isDel ? '−' : ' '}
                    </span>
                    {/* Code */}
                    <span className="min-w-0 flex-1 whitespace-pre font-mono">
                      {line.text.replace(/^[+-]\s?/, '')}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
