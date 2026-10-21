import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SKILLS = join(import.meta.dirname, "..", ".rulesync", "skills");

// Reads a skill's ```dot flowchart, written as one statement per line: a default shape, a node with its shape, or an
// edge with an optional label. Any other line fails, so a flowchart this parser can't read is never checked only in
// part. A node named only in edges takes the default shape, and a mistyped name then fails the reachability tests;
// with no default shape, it fails here.
function parseFlow(text) {
  const block = text.match(/^```dot\n([\s\S]*?)^```$/m)[1];
  const nodes = new Map();
  const edges = [];
  let defaultShape;
  for (const line of block.split("\n").map((l) => l.trim())) {
    if (!line || line.startsWith("//") || /^digraph \w+ \{$/.test(line) || line === "}") continue;
    const shape = line.match(/^node \[shape=(\w+)\];$/);
    const node = line.match(/^"([^"]+)" \[shape=(\w+)\];$/);
    const edge = line.match(/^"([^"]+)" -> "([^"]+)"(?: \[label="([^"]+)"\])?;$/);
    if (shape) defaultShape = shape[1];
    else if (node) nodes.set(node[1], node[2]);
    else if (edge) edges.push({ from: edge[1], to: edge[2], label: edge[3] });
    else assert.fail(`unreadable flowchart line: ${line}`);
  }
  for (const { from, to } of edges) {
    for (const name of [from, to]) {
      if (nodes.has(name)) continue;
      assert.ok(defaultShape, `edge names an undeclared node, and there is no default shape: ${name}`);
      nodes.set(name, defaultShape);
    }
  }
  return { nodes, edges };
}

// Each `### name` under `## Steps`, with its text up to the next heading.
function parseSteps(text) {
  const steps = text.split(/^## Steps$/m)[1] ?? "";
  return steps
    .split(/^### /m)
    .slice(1)
    .map((section) => {
      const [name, ...body] = section.split("\n");
      return { name, body: body.join("\n").split(/^## /m)[0] };
    });
}

// The exit codes a script can end with: 0, every `exit N`, and every N its `fail "message" N` helper is given.
function exitCodes(script) {
  const text = readFileSync(script, "utf8");
  const codes = new Set([0]);
  for (const match of text.matchAll(/\bexit (\d+)\b|\bfail "(?:[^"\\]|\\.)*" (\d+)\b/g)) codes.add(Number(match[1] ?? match[2]));
  return codes;
}

// A node is a step's when its name is the step's, or the step's followed by " (" or ",".
const isStepNode = (node, step) => node === step || node.startsWith(`${step} (`) || node.startsWith(`${step},`);

function reachable(start, next) {
  const seen = new Set([start]);
  for (const name of seen) for (const to of next(name)) seen.add(to);
  return seen;
}

const flowSkills = readdirSync(SKILLS).filter((name) => {
  const file = join(SKILLS, name, "SKILL.md");
  return existsSync(file) && /^```dot$/m.test(readFileSync(file, "utf8"));
});

for (const skill of flowSkills) {
  const text = readFileSync(join(SKILLS, skill, "SKILL.md"), "utf8");
  const { nodes, edges } = parseFlow(text);
  const out = (name) => edges.filter((e) => e.from === name);
  const ends = (shape) => [...nodes].filter(([, s]) => s === shape).map(([name]) => name);
  const start = ends("doublecircle").find((name) => !edges.some((e) => e.to === name));
  const end = ends("doublecircle").find((name) => out(name).length === 0);

  test(`flow_${skill}_usesEveryNode`, () => {
    for (const name of nodes.keys()) assert.ok(edges.some((e) => e.from === name || e.to === name), `unused node: ${name}`);
  });

  test(`flow_${skill}_hasOneStartAndOneEnd`, () => {
    assert.deepEqual(ends("doublecircle").sort(), [start, end].sort());
  });

  test(`flow_${skill}_reachesEveryNode_fromTheStart`, () => {
    const seen = reachable(start, (name) => out(name).map((e) => e.to));
    for (const name of nodes.keys()) assert.ok(seen.has(name), `unreachable from "${start}": ${name}`);
  });

  test(`flow_${skill}_reachesTheEnd_fromEveryNode`, () => {
    const seen = reachable(end, (name) => edges.filter((e) => e.to === name).map((e) => e.from));
    for (const name of nodes.keys()) assert.ok(seen.has(name), `no path to "${end}" from: ${name}`);
  });

  test(`flow_${skill}_labelsEachExitWithItsOwnCondition_whenANodeHasSeveral`, () => {
    for (const name of nodes.keys()) {
      const labels = out(name).map((e) => e.label);
      if (nodes.get(name) === "diamond") assert.ok(labels.length >= 2, `question with one answer: ${name}`);
      if (labels.length < 2) continue;
      assert.ok(labels.every(Boolean), `unlabelled exit from: ${name}`);
      assert.equal(new Set(labels).size, labels.length, `two exits with one label from: ${name}`);
    }
  });

  test(`flow_${skill}_namesEveryStep_inTheFlowchart`, () => {
    for (const { name } of parseSteps(text)) {
      assert.ok([...nodes.keys()].some((node) => isStepNode(node, name)), `step not in the flowchart: ${name}`);
    }
  });

  test(`flow_${skill}_hasAnEdgeForEachExitCode_whenAStepRunsAScript`, () => {
    for (const step of parseSteps(text)) {
      const scripts = [...new Set(step.body.match(/scripts\/[\w-]+\.sh/g) ?? [])];
      if (scripts.length === 0) continue;
      const expected = new Set(scripts.flatMap((script) => [...exitCodes(join(SKILLS, skill, script))]));
      const stepNodes = [...nodes.keys()].filter((node) => isStepNode(node, step.name));
      for (const node of stepNodes) {
        const covered = new Set(
          out(node).flatMap((e) => (e.label?.match(/^exit (\d+)(?: or (\d+))?\b/) ?? []).slice(1).filter(Boolean).map(Number)),
        );
        assert.deepEqual([...covered].sort(), [...expected].sort(), `exit codes on edges from: ${node}`);
        // An exit code split by when it happened ("exit 1 after the reply path") needs the other half too.
        const labels = out(node).map((e) => e.label ?? "");
        for (const label of labels) {
          const split = label.match(/^(exit \d+) (before|after) (.+)$/);
          if (!split) continue;
          const other = `${split[1]} ${split[2] === "before" ? "after" : "before"} ${split[3]}`;
          assert.ok(labels.includes(other), `"${label}" has no "${other}" edge from: ${node}`);
        }
      }
    }
  });
}
