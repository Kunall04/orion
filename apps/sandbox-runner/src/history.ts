import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_SNAPSHOTS = 50;

interface Entry {
  path: string;
  /** Where the old contents were saved, or null if the file did not exist before the change. */
  backup: string | null;
}

/**
 * Undo history for one session: before a tool changes a file, it calls snapshot().
 * undo() puts the newest saved copy back. Only changes made through our tools are tracked.
 * ponytail: the stack lives in memory (lost on restart); the backup files stay on disk.
 */
export class History {
  private stack: Entry[] = [];

  constructor(private dir: string) {}

  /** Save the file's current contents (or the fact that it does not exist yet). */
  async snapshot(path: string): Promise<void> {
    let backup: string | null = null;
    if (await exists(path)) {
      await mkdir(this.dir, { recursive: true });
      backup = join(this.dir, `${randomUUID()}.bak`);
      await copyFile(path, backup);
    }
    this.stack.push({ path, backup });

    if (this.stack.length > MAX_SNAPSHOTS) {
      const oldest = this.stack.shift()!;
      if (oldest.backup) await rm(oldest.backup, { force: true });
    }
  }

  /** Undo the most recent change. Returns text for the LLM, never throws. */
  async undo(): Promise<string> {
    const entry = this.stack.pop();
    if (!entry) return 'Nothing to undo.';

    try {
      if (entry.backup) {
        await copyFile(entry.backup, entry.path);
        await rm(entry.backup, { force: true });
        return `Undone: restored ${entry.path} to its previous contents.`;
      }
      await rm(entry.path, { force: true });
      return `Undone: deleted ${entry.path}, because it did not exist before that change.`;
    } catch (err) {
      return `Error: could not undo the change to ${entry.path}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
