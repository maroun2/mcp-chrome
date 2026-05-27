# Property Panel UI Refactor Plan

## Background

CurrentProperty面板 UI Implementation与设计稿 `attr-ui.html` 存in较大差异。本文档详细规划了refactorTask，按照优先级from高到低排列，目标是让Property面板视觉效果and交互体验与设计稿一致。

### Reference files

- **设计稿**：`/attr-ui.html`
- **CurrentStyle**：`ui/shadow-host.ts`
- **面板结构**：`ui/property-panel/property-panel.ts`
- **控件组件**：`ui/property-panel/controls/*.ts`

---

## Prerequisites (completed)

### 0.1 Minimize bug fix ✅

**问题**：toolbar andProperty面板最小化时，只是Background消失了，里面内容实际上还in

**根因**：CSS in `display: flex/inline-flex` 覆盖了 `[hidden]` Property默认 `display: none`

**解决方案**：

- [x] in `shadow-host.ts` 末尾Add全局 `[hidden] { display: none !important; }` 规则

### 0.2 Input field optimization ✅

**问题**：

1. Input框显示 placeholder 而Non-真实值
2. Number 类型Input框不Support键盘上下键adjustment

**解决方案**：

- [x] Create `ui/property-panel/controls/number-stepping.ts` 工具模块
  - Support ArrowUp/ArrowDown 键盘步进
  - Support Shift (10x)、Alt (0.1x) 修饰键
  - Support多种 CSS 单位 (px, %, rem, em, vh, vw, vmin, vmax)
- [x] 修改All control 显示真实值（inline 优先，fallback 到 computed）
- [x] asAll数值Input框Add keyboard stepping Support：
  - `size-control.ts` - Width/Height
  - `spacing-control.ts` - Margin/Padding
  - `position-control.ts` - Top/Right/Bottom/Left/Z-Index
  - `layout-control.ts` - Gap
  - `typography-control.ts` - Font Size/Line Height
  - `appearance-control.ts` - Opacity/Border Radius/Border Width

---

## Phase 1: Base visual system alignment ✅ Done

### 1.1 Color scheme refactor ✅

**目标**：Convertcolor系统fromCurrent灰色adjustmentas设计稿白底+灰Input框风格

| Property          | Old value         | New value                         | Status |
| ----------------- | ----------------- | --------------------------------- | ------ |
| 面板Background    | `#f8f8f8`         | `#ffffff`                         | ✅     |
| Input框Background | `#f0f0f0`         | `#f3f3f3`                         | ✅     |
| Input框 hover     | `#e8e8e8` (bg)    | `border #e0e0e0` (inset)          | ✅     |
| Input框 focus     | `box-shadow` 外圈 | `inset 2px border #3b82f6` + 白底 | ✅     |
| 边框色            | `#e8e8e8`         | `#e5e5e5`                         | ✅     |

**Completed tasks**：

- [x] 更新 CSS variableDefinition (`shadow-host.ts:56-97`)
- [x] 修改Input框 hover/focus Styleas inset border 模式
- [x] 面板Background改as纯白

### 1.2 Font and size adjustments ✅

| Property     | Old value | New value                 | Status |
| ------------ | --------- | ------------------------- | ------ |
| 面板基础字号 | `13px`    | `11px`                    | ✅     |
| 标签字号     | `11px`    | `10px`                    | ✅     |
| Input框字号  | `12px`    | `11px`                    | ✅     |
| font家族     | 系统font  | Inter + 系统font fallback | ✅     |

**Completed tasks**：

- [x] Add Inter fontdeclare（Use系统font fallback）
- [x] adjustment面板、标签、Input框字号
- [x] 移除标签大写Style

### 1.3 Spacing and margin adjustments ✅

| Property        | Old value   | New value  | Status |
| --------------- | ----------- | ---------- | ------ |
| 面板宽度        | `320px`     | `280px`    | ✅     |
| Header 内margin | `10px 14px` | `8px 12px` | ✅     |
| Body gap        | `10px`      | `12px`     | ✅     |

**Completed tasks**：

- [x] adjustment `.we-panel`, `.we-prop-body`, `.we-field-group` padding/gap
- [x] adjustment header padding

### 1.4 Border radius and shadow ✅

| Property             | Old value   | New value          | Status |
| -------------------- | ----------- | ------------------ | ------ |
| 面板shadow           | `0 1px 2px` | Tailwind shadow-xl | ✅     |
| Input框border radius | `6px`       | `4px`              | ✅     |
| Tab shadow           | 无          | `shadow-sm`        | ✅     |

**Completed tasks**：

- [x] enhancement面板shadow效果（双层shadow模拟 shadow-xl）
- [x] adjustmentInput框border radiusas 4px
- [x] as激活 Tab Addshadow

### 1.5 Group/Section style refactor ✅

| Property     | 旧Style     | 新Style     | Status |
| ------------ | ----------- | ----------- | ------ |
| Group 边框   | 卡片边框    | 无边框      | ✅     |
| Section 分隔 | 无          | 顶部分隔线  | ✅     |
| Header Style | 粗体 + 大字 | 11px + #333 | ✅     |

**Completed tasks**：

- [x] 移除 `.we-group` 边框andBackground
- [x] Add Section 间分隔线 (`border-top`)
- [x] adjustment Group header Style

---

## Phase 2: Input container component refactor ✅ Base done

### 2.1 Establish input container system ✅

**Background**：设计稿Input框不是单体 input，而是一个容器系统，Support：

- 前缀（prefix）：标签、图标
- 后缀（suffix）：单位、图标
- 容器驱动 hover/focus Style

**Current结构**：

```html
<div class="we-field">
  <span class="we-field-label">Width</span>
  <input class="we-input" />
</div>
```

**目标结构**：

```html
<div class="we-field">
  <span class="we-field-label">Position</span>
  <div class="we-input-container">
    <!-- 新增容器 -->
    <span class="we-input-container__prefix">X</span>
    <!-- 可选前缀 -->
    <input class="we-input-container__input" />
    <span class="we-input-container__suffix">px</span>
    <!-- 可选后缀 -->
  </div>
</div>
```

**已completed**：

- [x] in `shadow-host.ts` inDefinition `.we-input-container` Style
- [x] Definition `.we-input-container__prefix` and `.we-input-container__suffix` Style
- [x] Create `ui/property-panel/components/input-container.ts` 组件
- [x] Convert hover/focus Style移到容器级别（Use `:focus-within`）

### 2.2 Update controls to use new container ✅ Done

**需要更新控件**：

- [x] `size-control.ts` - Width/Height（2列布局 + W/H 前缀 + Dynamic unit suffix）
- [x] `spacing-control.ts` - Margin/Padding（refactoras 2x2 网格 + 方向图标 + Dynamic unit suffix）
- [x] `position-control.ts` - Top/Right/Bottom/Left/Z-Index（T/R/B/L 前缀 + Dynamic unit suffix）
- [x] `layout-control.ts` - Gap（图标前缀 + Dynamic unit suffix）
- [x] `typography-control.ts` - Font Size/Line Height（Dynamic unit suffix，line-height 智能显示）
- [ ] `appearance-control.ts` - Opacity/Border Radius/Border Width（Pending implementation）

**已completedshared模块**：

- [x] Create `css-helpers.ts` shared模块（extractUnitSuffix, hasExplicitUnit, normalizeLength）
- [x] All控件Useshared helper，消除重复代码

---

## Phase 3: Section structure refactor (Pending)

### 3.1 Tab information architecture adjustment

**Current**：4 个 Tab（Design/CSS/Props/DOM）
**设计稿**：2 个 Tab（Design/CSS）

**方案选择**：

- **方案 A**：保留 4 个 Tab，adjustmentas溢出菜单
- **方案 B**：Convert Props/DOM 移到其他入口
- **方案 C**：Maintain 4 个 Tab，adjustmentStyle适应

**Task**：

- [ ] 确定 Tab 数量产品决策
- [ ] Implementation选定方案

---

## Phase 4: Feature component implementation (Pending)

### 4.1 Flow layout icon group ✅ Done

**Design position**：`attr-ui.html:133-156`
**Feature**：4 个图标按钮Control `flex-direction`

```
[→] Row
[↓] Column
[←] Row Reverse
[↑] Column Reverse
```

**已completed**：

- [x] Create `ui/property-panel/components/icon-button-group.ts` 通用组件
- [x] in `shadow-host.ts` inAdd `.we-icon-button-group` Style
- [x] in `layout-control.ts` in用图标组替换 Direction select
- [x] Add对应 SVG 箭头图标（row/column/row-reverse/column-reverse）

### 4.2 Alignment grid ✅ Done

**Design position**：`attr-ui.html:166-208`
**Feature**：3x3 网格Control `justify-content` + `align-items`

```
[↖][↑][↗]
[←][·][→]
[↙][↓][↘]
```

**已completed**：

- [x] Create `ui/property-panel/components/alignment-grid.ts` 组件
- [x] in `shadow-host.ts` inAdd `.we-alignment-grid` Style
- [x] 替换 `layout-control.ts` in Justify/Align select
- [x] Use `beginMultiStyle` Implementation两个Property原子Submit

### 4.3 Fix Color Picker ✅ Partially done

**Current问题**：

- `showPicker()` 无 try/catch，可能抛错
- alpha 通道被discard
- token 值 `var(--xxx)` 显示不正确

**已completed**：

- [x] Add `showPicker()` 错误handle（try/catch + fallback to click）
- [x] 改进 `var()` 值解析and显示（Through placeholder 传入 computed value）

**Pending implementation**：

- [ ] Support alpha 通道（RGBA/HSLA）- 需要引入第三方 color picker
- [ ] 考虑引入第三方 color picker（如 `@simonwep/pickr`）

---

## Phase 5: New feature modules (Pending)

### 5.1 Shadow & Blur Control

**Design position**：`attr-ui.html:396-425`
**Feature**：

- 启用/禁用开关
- 类型选择（Drop shadow/Inner shadow/Layer Blur/Backdrop Blur）
- 可见性Control

**CSS Property**：

- `box-shadow`
- `filter: blur()`
- `backdrop-filter: blur()`

**Task**：

- [x] Create `ui/property-panel/controls/effects-control.ts`
- [x] Implementation `box-shadow` 值解析and编辑
- [x] Implementation `filter` 值解析and编辑
- [x] Implementation `backdrop-filter` 值解析and编辑
- [x] Add类型切换 UI
- [ ] Add启用/禁用开关（可选，后续Implementation）

### 5.2 Gradient editor

**Design position**：`attr-ui.html:269-325`
**Feature**：

- Linear/Radial gradient类型
- color停止点（color stops）
- 角度Control
- 翻转按钮

**CSS Property**：

- `background-image: linear-gradient(...)`
- `background-image: radial-gradient(...)`

**Task**：

- [x] Create `ui/property-panel/controls/gradient-control.ts`
- [x] Implementationgradient值解析（CSS gradient → 数据结构）
- [x] Implementation角度/位置Input
- [x] Implementation 2 个color停止点编辑
- [x] Integrated into property-panel（作as独立 Gradient Control组）
- [ ] Implementationgradient预览 slider（可选，后续optimization）
- [ ] Implementation color stop Add/删除/拖拽（可选，后续optimization）

### 5.3 Token/variable pill display

**Design position**：`attr-ui.html:374-384`
**Feature**：当值as CSS variable时，显示as可点击 pill

**Task**：

- [ ] 检测 `var(--xxx)` 值
- [ ] 渲染as pill Style
- [ ] 点击open token picker

---

## Phase 6: Code quality (ongoing)

### 6.1 Style system unification

- [x] AllcolorUse CSS variable（phase一completed）
- [ ] All尺寸Use一致 token
- [ ] 移除 inline style，unified到 `shadow-host.ts`

### 6.2 Component reuse

- [ ] 提取通用组件到 `ui/property-panel/components/`
- [ ] unified事件handle模式
- [ ] unified disabled/enabled Statushandle

### 6.3 Type safety

- [ ] All组件Use TypeScript 严格类型
- [ ] Definition清晰接口and类型
- [ ] 移除 any 类型断言

---

## Implementation progress

| phase | Task                      | Status                 | 备注                                                  |
| ----- | ------------------------- | ---------------------- | ----------------------------------------------------- |
| 0.1   | 最小化 Bug Fix            | ✅                     | Add全局 `[hidden]` 规则                               |
| 0.2   | Input框optimization       | ✅                     | number-stepping + 真实值显示                          |
| 1.1   | color方案refactor         | ✅                     | 白底 + 灰Input框 + inset focus                        |
| 1.2   | font与字号adjustment      | ✅                     | 11px 基准 + Inter font                                |
| 1.3   | spacing与marginadjustment | ✅                     | 更紧凑布局                                            |
| 1.4   | border radius与shadow     | ✅                     | shadow-xl + 4px border radius                         |
| 1.5   | Group/Section Style       | ✅                     | 分隔线风格                                            |
| 2.1   | Input容器系统             | ✅                     | 组件 + CSS Style                                      |
| 2.2   | 更新 Controls             | ✅                     | All主要控件已迁移，shared css-helpers.ts              |
| 3.1   | Tab 信息架构              | Pending implementation |                                                       |
| 4.1   | Flow 图标组               | ✅                     | icon-button-group.ts + Integrated into layout-control |
| 4.2   | Alignment 九宫格          | ✅                     | alignment-grid.ts + Integrated into layout-control    |
| 4.3   | Fix Color Picker          | ✅ 部分                | showPicker 异常handle + var() 解析                    |
| 5.1   | Shadow & Blur             | ✅                     | effects-control.ts + Integrated into property-panel   |
| 5.2   | Gradient editor           | ✅                     | gradient-control.ts + Integrated into property-panel  |
| 5.3   | Token Pill                | Pending implementation |                                                       |

---

## Notes

1. **渐进式实施**：每个 Phase completed后应可独立测试andPublish
2. **Maintain向后兼容**：refactor过程in不应破坏现有Feature
3. **设计决策Record**：遇到设计稿与实际需求冲突时，Record决策Reason
4. **性能考虑**：新增组件需考虑渲染性能，avoid不必要 DOM Operation
