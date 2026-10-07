// 技能（Skill）格式校验 · 规则（纯函数，无 I/O）
//
// 为什么需要：技能加载失败是**静默**的——目录条目只解析 frontmatter，缺 name/description 或
// 目录名与 name 不一致时，技能只是"不出现"，没有任何报错。这类"配置存在但不生效"正是
// docs/agent-workflow.md §1 要消灭的东西，所以给技能加一道会红的检查。
//
// 格式依据（DeepSeek Harness 的技能加载约定，2026-10-07 盘点）：
//   - 形态为 `<root>/<name>/SKILL.md`（不是 `<root>/<name>.md`，也**不支持**嵌套 `**/SKILL.md`）；
//   - frontmatter 必填 `name` 与 `description`，可选 `whenToUse` 等；
//   - 正文按需加载。

/** 解析形如 `---\nkey: value\n---\n正文` 的 frontmatter（只支持本仓用到的扁平单行键值）。 */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { error: '缺少 frontmatter（文件必须以 --- 开头，以 --- 结束）' };
  const data = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = line.indexOf(':');
    if (sep === -1) return { error: `frontmatter 行无法解析：${line}` };
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: match[2] };
}

/** 校验单个技能；返回问题数组（空数组=合法）。 */
export function validateSkill(dirName, text) {
  const problems = [];
  const parsed = parseFrontmatter(text);
  if (parsed.error) return [parsed.error];

  const { data, body } = parsed;
  if (!data.name) problems.push('frontmatter 缺少 name');
  if (!data.description) problems.push('frontmatter 缺少 description');
  if (data.name && data.name !== dirName) {
    problems.push(`frontmatter 的 name（${data.name}）与目录名（${dirName}）不一致`);
  }
  if (data.description && data.description.trim().length < 20) {
    problems.push('description 太短：它是模型判断"何时用这个技能"的唯一依据');
  }
  if (data.whenToUse !== undefined && !data.whenToUse) {
    problems.push('whenToUse 存在但为空');
  }
  if (!body || body.trim().length === 0) problems.push('frontmatter 之后没有正文');
  return problems;
}
