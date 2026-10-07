// 技能格式规则的回归测试。
//
// 重点：技能加载失败是静默的，所以"看起来对"的写法必须真被判过——尤其 name 与目录名不一致、
// description 过短、以及不受支持的嵌套这几种"不会报错但也不生效"的情况。

import { describe, expect, it } from 'vitest';
import { parseFrontmatter, validateSkill } from './skill-rules.mjs';

const skill = (frontmatter, body = '\n# 标题\n\n正文\n') => `---\n${frontmatter}\n---\n${body}`;

const VALID = 'name: demo\n' + 'description: A sufficiently long description for the demo skill.';

describe('parseFrontmatter', () => {
  it('解析键值并保留正文', () => {
    const { data, body } = parseFrontmatter(skill(VALID, '\n# 正文标题\n内容\n'));
    expect(data.name).toBe('demo');
    expect(data.description).toContain('sufficiently long');
    expect(body).toContain('# 正文标题');
  });

  it('去掉值两侧的引号', () => {
    const { data } = parseFrontmatter(skill('name: demo\ndescription: "带引号的描述，长度足够用于校验。"'));
    expect(data.description).toBe('带引号的描述，长度足够用于校验。');
  });

  it('缺少 frontmatter 时报错', () => {
    expect(parseFrontmatter('# 没有 frontmatter\n').error).toContain('frontmatter');
  });
});

describe('validateSkill', () => {
  it('合法技能没有问题', () => {
    expect(validateSkill('demo', skill(VALID))).toEqual([]);
  });

  it('缺 name / description 各报一条', () => {
    expect(validateSkill('demo', skill('description: 足够长的描述文本用于通过校验。')).join()).toContain(
      'name',
    );
    expect(validateSkill('demo', skill('name: demo')).join()).toContain('description');
  });

  it('name 与目录名不一致会被抓（否则技能静默不加载）', () => {
    expect(validateSkill('other-dir', skill(VALID)).join()).toContain('目录名');
  });

  it('description 过短会被抓（它是模型判断何时用它的唯一依据）', () => {
    expect(validateSkill('demo', skill('name: demo\ndescription: 太短')).join()).toContain('太短');
  });

  it('whenToUse 为空会被抓', () => {
    expect(validateSkill('demo', skill(`${VALID}\nwhenToUse:`)).join()).toContain('whenToUse');
  });

  it('正文为空会被抓', () => {
    expect(validateSkill('demo', skill(VALID, '\n\n')).join()).toContain('正文');
  });
});
