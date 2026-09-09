## 修复
- 修复设置弹窗「PDF 导出」标签页显示空白的问题：阅读设置面板容器缺少闭合标签导致 PDF 导出面板被嵌套隐藏（#27 合并时引入）。现在 PDF 导出样式系统（24 套模板 / 字体 / 颜色 / 间距 / 实时预览）可正常使用。
- 修复部分 Mermaid 图渲染失败、图的位置直接显示 "This page contains the following errors: Opening and ending tag mismatch: br and p" 错误文本的问题。节点/边标签含 `<br/>` 换行、标签较多的图（XML 解析失败）现在可以正常渲染。
