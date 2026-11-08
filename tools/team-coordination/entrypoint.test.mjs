import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, symlinkSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Stub external reads so the actual CLI entrypoint can be exercised offline.
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'coordination-entry-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scriptDir = join(root, 'repo');
  const bin = join(root, 'bin');
  mkdirSync(scriptDir);
  mkdirSync(bin);
  for (const file of ['refresh.mjs', 'queue.mjs']) copyFileSync(new URL(file, import.meta.url), join(scriptDir, file));
  for (const name of ['git', 'gh']) {
    writeFileSync(join(bin, name), `#!${process.execPath}\nconst args=process.argv.slice(2);\nif (args[0]==='rev-parse' || args[0]==='api') console.log('abc');\nelse if (args[0]==='ls-tree') console.log('docs/team/status/new-owner.md');\nelse if (args[0]==='show') console.log('Decision: inspect fixture');\nelse console.log('[]');\n`, { mode: 0o700 });
  }
  const output = join(scriptDir, 'output');
  mkdirSync(output);
  writeFileSync(join(output, 'queue.md'), 'OLD SNAPSHOT');
  return { root, scriptDir, bin, output };
}

for (const mode of ['direct', 'symlink-directory', 'symlink-script', 'macos-tmp-alias']) {
  test(`CLI replaces stale output when invoked through ${mode}`, { skip: mode === 'macos-tmp-alias' && process.platform !== 'darwin' }, t => {
    const f = fixture(t);
    let entry = join(f.scriptDir, 'refresh.mjs');
    if (mode === 'symlink-directory') {
      symlinkSync(f.scriptDir, join(f.root, 'alias'));
      entry = join(f.root, 'alias', 'refresh.mjs');
    } else if (mode === 'symlink-script') {
      entry = join(f.root, 'refresh-link.mjs');
      symlinkSync(join(f.scriptDir, 'refresh.mjs'), entry);
    } else if (mode === 'macos-tmp-alias') {
      // tmpdir can point at /var/folders, so make a real /tmp alias explicitly.
      const temporary = mkdtempSync('/tmp/coordination-alias-');
      t.after(() => rmSync(temporary, { recursive: true, force: true }));
      symlinkSync(f.scriptDir, join(temporary, 'repo'));
      entry = join(temporary, 'repo', 'refresh.mjs');
      assert.notEqual(entry, realpathSync(entry));
    }
    const result = spawnSync(process.execPath, [entry], { encoding: 'utf8', env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}` }, timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /review items; collection complete/);
    assert.notEqual(readFileSync(join(f.output, 'queue.md'), 'utf8'), 'OLD SNAPSHOT');
    assert.equal(JSON.parse(readFileSync(join(f.output, 'queue.json'), 'utf8')).baseline, 'abc');
  });
}
