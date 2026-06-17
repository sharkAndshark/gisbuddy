const fs = require('fs');

// ── CLI args ──
const args = process.argv.slice(2);
let filePath = null;
let mode = 'warn';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--error') mode = 'error';
  else if (args[i] === '--warn') mode = 'warn';
  else if (!args[i].startsWith('--')) filePath = args[i];
}

if (!filePath) {
  console.error('Usage: node scripts/check-behaviors.js <behaviors.md> [--warn|--error]');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`文件不存在: ${filePath}`);
  process.exit(1);
}

// ── Parse markdown tables ──
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

// Find ALL table rows (start and end with |, excluding separator lines like |---|)
const allRows = [];
for (const line of lines) {
  const t = line.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) continue;
  if (/^\|[\s\-:|\t]+\|$/.test(t)) continue; // separator
  const cells = t.split('|').slice(1, -1).map(c => c.trim());
  allRows.push(cells);
}

// Find the first header row to determine column positions
let headerIdx = -1;
for (let i = 0; i < allRows.length; i++) {
  if (allRows[i].some(c => c.startsWith('测试编号'))) {
    headerIdx = i;
    break;
  }
}

if (headerIdx < 0) {
  console.error('未在 behaviors.md 中找到表格表头（测试编号 列）。');
  process.exit(1);
}

const header = allRows[headerIdx];
const colTestId = header.findIndex(c => c.startsWith('测试编号'));
const colReason = header.findIndex(c => c.startsWith('测试合理性'));
const colExempt = header.findIndex(c => c.startsWith('解耦建议'));

if (colTestId < 0 || colReason < 0 || colExempt < 0) {
  console.error('表格表头缺少必要列：测试编号 / 测试合理性 / 解耦建议/豁免');
  process.exit(1);
}

// Collect data rows (skip all header-like rows that appear in later tables)
function isHeaderRow(row) {
  return row.length > 0 && row[0] === '模块';
}

const dataRows = [];
for (let i = headerIdx + 1; i < allRows.length; i++) {
  const row = allRows[i];
  if (isHeaderRow(row)) continue;
  if (row.length <= Math.max(colTestId, colReason, colExempt)) continue; // too short
  // Only accept rows whose behavior ID matches B\d+ pattern
  const bid = (row[1] || '').trim();
  if (!/^B\d+$/.test(bid)) continue;
  dataRows.push(row);
}

// ── Analyse ──

// Check for duplicate behavior IDs
const seenIds = new Map();
const dupes = [];
for (const row of dataRows) {
  const bid = row[1].trim();
  const prev = seenIds.get(bid);
  if (prev) {
    dupes.push({ id: bid, desc: row[2].trim(), prevDesc: prev.desc });
  } else {
    seenIds.set(bid, { desc: row[2].trim() });
  }
}
if (dupes.length > 0) {
  for (const d of dupes) {
    console.log(`${YELLOW}⚠ 重复行为 ID: ${d.id} (${d.prevDesc} / ${d.desc})${RESET}`);
  }
}

const untestedWarnings = [];
const untestedExempted = [];
let totalBehaviors = 0;
let totalUntested = 0;

for (const row of dataRows) {
  totalBehaviors++;
  const testId = row[colTestId]?.trim() || '';
  const reasonStr = row[colReason]?.trim() || '0';
  const exemptStr = row[colExempt]?.trim() || '';
  const moduleName = row[0]?.trim() || 'Unknown';
  const behaviorId = row[1]?.trim() || '??';
  const behaviorDesc = row[2]?.trim() || '';

  const reasonScore = parseInt(reasonStr, 10) || 0;

  const isUntested = !testId || testId === '无' || testId === '—';

  if (!isUntested) continue;

  totalUntested++;

  const isExempt = reasonScore < 3 || exemptStr.includes('✓ 认可');

  if (isExempt) {
    untestedExempted.push({ moduleName, behaviorId, behaviorDesc, reasonScore, exemptStr });
  } else {
    untestedWarnings.push({ moduleName, behaviorId, behaviorDesc, reasonScore, exemptStr });
  }
}

const totalTested = totalBehaviors - totalUntested;

// ── Output ──
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const label = mode === 'error' ? `${RED}❌ ERROR${RESET}` : `${YELLOW}⚠ WARN${RESET}`;

console.log(`${CYAN}🔍 检查 behaviors.md — 未测行为审计${RESET}\n`);
console.log(`  总计 ${totalBehaviors} 个行为，已测 ${totalTested} 个，未测 ${totalUntested} 个`);
console.log(`  过滤条件: 测试合理性 ≥ 3 且未标记 "✓ 认可"`);
console.log(`  模式: ${mode === 'error' ? `${RED}--error (阻断提交)${RESET}` : `${YELLOW}--warn (仅警告)${RESET}`}`);

if (untestedExempted.length > 0) {
  console.log(`\n${DIM}  已豁免 ${untestedExempted.length} 个未测行为（合理性 < 3 或 ✓ 认可）${RESET}`);
}

if (untestedWarnings.length > 0) {
  console.log(`\n${label}  发现 ${untestedWarnings.length} 个缺少测试的行为:\n`);

  for (const w of untestedWarnings) {
    const line = `  [${w.moduleName}] ${w.behaviorId} ${w.behaviorDesc} ${DIM}— 合理性: ${w.reasonScore} | ${w.exemptStr}${RESET}`;
    console.log(mode === 'error' ? RED + line + RESET : YELLOW + line + RESET);
  }

  console.log(`\n${BOLD}建议:${RESET} 为以上行为补充单元测试，或标记为 "✓ 认可" 豁免。`);
} else {
  console.log(`\n${GREEN}✓ 所有需测行为均已覆盖测试或无遗漏。${RESET}`);
}

// ── Exit ──
if (mode === 'error' && untestedWarnings.length > 0) {
  process.exit(1);
}
process.exit(0);
