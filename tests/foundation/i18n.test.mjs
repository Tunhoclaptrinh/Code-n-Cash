import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Every label the screens build from a code must exist in both languages, so no raw key such as
// "permissions.modules.controls" ever reaches the screen.
const locales = "apps/web/src/locales";
const load = async (lang, ns) =>
  JSON.parse(await readFile(join(locales, lang, `${ns}.json`), "utf8"));
const at = (object, path) =>
  path.split(".").reduce((node, key) => node?.[key], object);
const keysOf = (object, prefix = "") =>
  Object.entries(object).flatMap(([key, value]) =>
    value && typeof value === "object"
      ? keysOf(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );

/** String values of `export type Name = | "A" | "B";` in the shared domain types. */
async function union(name) {
  const source = await readFile("apps/api/src/domain/types.ts", "utf8");
  const match = new RegExp(`export type ${name} =([^;]+);`).exec(source);
  assert.ok(match, `type ${name} not found`);
  return [...match[1].matchAll(/"([A-Z_0-9]+)"/g)].map((m) => m[1]);
}

test("Vietnamese and English have the same keys in every namespace", async () => {
  for (const file of await readdir(join(locales, "vi"))) {
    const ns = file.replace(/\.json$/, "");
    // Plural suffixes differ by language (Vietnamese has only "_other"), so compare base keys.
    const base = (keys) =>
      [
        ...new Set(
          keys.map((k) => k.replace(/_(zero|one|two|few|many|other)$/, "")),
        ),
      ].sort();
    const vi = base(keysOf(await load("vi", ns)));
    const en = base(keysOf(await load("en", ns)));
    assert.deepEqual(
      en.filter((k) => !vi.includes(k)),
      [],
      `${ns}: only in en`,
    );
    assert.deepEqual(
      vi.filter((k) => !en.includes(k)),
      [],
      `${ns}: only in vi`,
    );
  }
});

test("every code shown on screen has a label", async () => {
  const permissions = JSON.parse(
    await readFile("packages/contracts/permissions.json", "utf8"),
  );
  const resources = JSON.parse(
    await readFile("packages/contracts/resources.json", "utf8"),
  );
  const businessEvents = await union("BusinessEventType");
  const supportEvents = await union("SupportEventType");
  const expected = {
    domain: {
      eventType: [...businessEvents, ...supportEvents],
      eventStatus: await union("EventStatus"),
      reason: await union("ReasonCode"),
      status: await union("MilestoneStatus"),
      contractStatus: await union("ContractStatus"),
      milestoneType: await union("MilestoneType"),
      contractType: await union("ContractType"),
      policy: await union("ApprovalPolicy"),
      taskKind: await union("TaskKind"),
      origin: await union("Origin"),
      approvalRole: await union("ApprovalRole"),
      side: await union("Side"),
      partyType: await union("PartyType"),
      eventClass: await union("EventClass"),
      ruleOutcome: await union("RuleOutcome"),
      decisionHint: await union("Decision"),
    },
    common: {
      roles: permissions.roles,
    },
    audit: {
      categories: await union("ActivityCategory"),
      actorRoles: [
        ...permissions.roles,
        ...(await union("PartyType")),
        "SYSTEM",
      ],
    },
    platform: {
      "permissions.modules": permissions.modules.map((m) => m.key),
      "permissions.items": permissions.modules.flatMap((m) =>
        m.permissions.map((p) => p.key),
      ),
      resources: resources.map((r) => r.name),
      fields: resources.flatMap((r) => r.fields.map((f) => f.key)),
      ...Object.fromEntries(
        resources
          .flatMap((r) => r.fields)
          .filter((f) => f.options && f.key !== "role")
          .map((f) => [`options.${f.key}`, f.options]),
      ),
    },
  };
  const problems = [];
  for (const lang of ["vi", "en"])
    for (const [ns, groups] of Object.entries(expected)) {
      const strings = await load(lang, ns);
      for (const [group, codes] of Object.entries(groups))
        for (const code of codes) {
          const value =
            at(strings, `${group}.${code}`) ??
            at(strings, `${group}.${code}.name`);
          if (typeof value !== "string" && typeof value !== "object")
            problems.push(`${lang}/${ns}: ${group}.${code}`);
        }
    }
  assert.deepEqual(problems, []);
});

test("every error code the API sends has a message", async () => {
  const codes = new Set();
  for (const dir of ["apps/api/src/domain", "apps/api/src"]) {
    for (const file of await readdir(dir)) {
      if (!file.endsWith(".ts")) continue;
      const source = await readFile(join(dir, file), "utf8");
      for (const m of source.matchAll(/Exception\("([A-Z_]+)"\)/g))
        codes.add(m[1]);
    }
  }
  const missing = [];
  for (const lang of ["vi", "en"]) {
    const domain = await load(lang, "domain");
    for (const code of codes)
      if (!domain.errors?.[code]) missing.push(`${lang}: ${code}`);
  }
  assert.deepEqual(missing, []);
});

test("every guide topic has both translations and existing screenshots", async () => {
  const root = "apps/web/src/guide";
  const source = await readFile(join(root, "topics.ts"), "utf8");
  const list = source.match(/GUIDE_TOPICS = \[([\s\S]*?)\] as const/);
  assert.ok(list, "guide topic list exists");
  const topics = [...list[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  const labels = await load("en", "common");
  for (const lang of ["vi", "en"]) {
    for (const topic of topics) {
      assert.ok(labels.guide.topics[topic], `${topic}: menu label exists`);
      const path = join(root, lang, `${topic}.md`);
      const markdown = await readFile(path, "utf8");
      assert.match(markdown, /^# .+/);
      assert.ok(markdown.length > 500, `${path}: substantive instructions`);
      const images = [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
      assert.ok(images.length, `${path}: illustrated instructions`);
      for (const image of images)
        await access(resolve(dirname(path), image[1]));
      for (const link of markdown.matchAll(/\]\(\/guide\/([a-z]+)\)/g))
        assert.ok(topics.includes(link[1]), `${path}: valid topic ${link[1]}`);
    }
  }
});
