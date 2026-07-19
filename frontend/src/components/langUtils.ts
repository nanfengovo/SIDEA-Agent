/** 消息级翻译目标语（与消息工具栏下拉一致） */
export type TargetLang = '简体中文' | '繁體中文' | 'English' | '日本語';

export const TARGET_LANG_OPTIONS: { value: TargetLang; label: string }[] = [
  { value: '简体中文', label: '简中' },
  { value: '繁體中文', label: '繁中' },
  { value: 'English', label: 'EN' },
  { value: '日本語', label: '日文' },
];

/** 是否需要调用 LLM（简↔繁可本地完成） */
export function needsLlmTranslate(lang: TargetLang): boolean {
  return lang === 'English' || lang === '日本語';
}

/** 常用简→繁字表（工业大屏文案够用，无需引入 OpenCC） */
const S2T_CHARS: Record<string, string> = {
  产: '產', 与: '與', 缺: '缺', 陷: '陷', 追: '追', 踪: '蹤',
  工: '工', 艺: '藝', 能: '能', 耗: '耗', 分: '分', 布: '佈',
  刀: '刀', 具: '具', 磨: '磨', 损: '損', 预: '預', 测: '測',
  核: '核', 心: '心', 温: '溫', 度: '度', 阵: '陣', 列: '列',
  车: '車', 间: '間', 数: '數', 字: '字', 孪: '孿', 生: '生',
  监: '監', 控: '控', 大: '大', 屏: '屏',
  实: '實', 时: '時', 长: '長',
  次: '次', 品: '品', 率: '率', 冲: '衝', 压: '壓', 焊: '焊', 接: '接',
  喷: '噴', 涂: '塗', 总: '總', 装: '裝',
  正: '正', 常: '常', 高: '高', 危: '危', 警: '警',
  暂: '暫', 无: '無', 据: '據', 点: '點',
  个: '個', 独: '獨', 立: '立', 面: '面', 板: '板',
  主: '主', 题: '題', 随: '隨', 系: '系', 统: '統', 切: '切', 换: '換',
  支: '支', 持: '持', 中: '中', 英: '英', 双: '雙', 语: '語',
  全: '全', 新: '新', 标: '標', 签: '籤', 页: '頁', 导: '導', 出: '出',
  复: '複', 制: '製', 源: '源', 码: '碼', 援: '援',
  为: '為', 这: '這', 还: '還', 后: '後', 过: '過', 开: '開',
  关: '關', 门: '門', 电: '電', 机: '機', 动: '動', 发: '發',
  现: '現', 说: '說', 请: '請', 让: '讓', 对: '對', 从: '從',
  会: '會', 们: '們', 国: '國', 图: '圖', 条: '條', 样: '樣',
};

const S2T_PHRASES: [string, string][] = [
  ['实时', '實時'],
  ['数字孪生', '數字孿生'],
  ['监控大屏', '監控大屏'],
  ['独立面板', '獨立面板'],
  ['支持中英双语', '支援中英雙語'],
  ['主题随系统切换', '主題隨系統切換'],
  ['暂无数据点', '暫無數據點'],
  ['高危预警', '高危預警'],
  ['中文标题', '中文標題'],
  ['英文标题', '英文標題'],
  ['生成结果', '生成結果'],
  ['用于前端渲染', '用於前端渲染'],
  ['次品率', '次品率'],
  ['磨损度', '磨損度'],
];

export function simplifiedToTraditional(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [s, t] of S2T_PHRASES) out = out.split(s).join(t);
  out = out.replace(/[\u4e00-\u9fff]/g, (ch) => S2T_CHARS[ch] || ch);
  return out;
}

/**
 * 翻译前保护 Markdown 围栏（echarts / mermaid / 代码），避免 LLM 改坏 URL 与 JSON。
 */
export function protectFencedBlocks(text: string): {
  masked: string;
  restore: (translated: string) => string;
  blockCount: number;
} {
  const blocks: string[] = [];
  const masked = text.replace(/```[\s\S]*?```/g, (m) => {
    const idx = blocks.length;
    blocks.push(m);
    return `\n[[SIDEA_BLOCK_${idx}]]\n`;
  });
  const restore = (translated: string) =>
    translated.replace(/\[\[SIDEA_BLOCK_(\d+)\]\]/g, (_, n) => blocks[Number(n)] ?? '');
  return { masked, restore, blockCount: blocks.length };
}

/** 仅对围栏外的正文做简→繁（图表 URL / JSON 原样保留） */
export function convertMarkdownToTraditional(text: string): string {
  const { masked, restore } = protectFencedBlocks(text);
  return restore(simplifiedToTraditional(masked));
}
