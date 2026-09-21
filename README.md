# tiny-md

零依赖的 Markdown + LaTeX 渲染器。一个 JS 文件，不加载字体、不发网络请求。

## 为什么不用 marked / markdown-it / KaTeX

- **Markdown**：它们不管 XSS，`<script>` 会原样进 DOM，得再引 DOMPurify
- **LaTeX**：KaTeX/MathJax 要加载 CSS + 多套字体，网络一卡公式就变乱码或空白

tiny-md 的选择：**先转义，再生成标签**。输入里的 `<script>` 早已变成
`&lt;script&gt;`，不可能被当标签执行。公式用自研子集渲染，零外部资源，
永远不会"加载失败"。

## 安装

### 一行引入（推荐）

```html
<script src="https://cdn.jsdelivr.net/gh/Cool-zimo/tiny-md@main/tiny-md.js"></script>
<script>TinyMD.injectCSS();</script>
```

样式内嵌在 JS 里，`injectCSS()` 会把它插进页面；也可以单独引 `tiny-md.css`。

### npm

```bash
npm i tiny-md     # 或直接下载 tiny-md.js
```

```js
const TinyMD = require('tiny-md');
document.body.innerHTML = TinyMD.render('# 你好');
```

## API

```js
TinyMD.render(text)          // → HTML 字符串
TinyMD.renderTex(latex)      // 只渲染一段 LaTeX
TinyMD.highlight(code, lang) // 只做代码高亮
TinyMD.esc(s)                // 转义

TinyMD.renderInto(el, text)  // 渲染进元素（自动加 .tm-body）
TinyMD.injectCSS()           // 插入样式（幂等）
TinyMD.auto()                // 渲染页面上所有 <script type="text/tiny-md">
```

### 不想写 JS

```html
<script type="text/tiny-md">
# 直接写 Markdown
公式 $x^2$ 也能渲染
</script>
<script src="tiny-md.js" onload="TinyMD.auto()"></script>
```

## 支持什么

**Markdown**：标题、列表、任务列表、表格、引用、分隔线、图片、链接、
裸URL、粗体/斜体/删除线/高亮、行内代码、代码块（带语言标签、复制按钮和语法高亮）

**代码高亮**：js/ts/json/python/bash/sql/go/rust/css/yaml/html/xml/c/cpp/java 等
（通过别名覆盖几十种写法）。关键字、字符串、数字、注释、函数名、常量、运算符、
HTML 标签名都能上色，且不引 highlight.js/prism。

```js
TinyMD.highlight('const x = 1;', 'js')
// <span class="hl-kw">const</span> x <span class="hl-op">=</span> ...
```

注释和字符串优先级最高 —— 里面的关键字不会被误上色。

**LaTeX**：希腊字母、上下标（可嵌套）、分数（可嵌套）、根号、运算符、
箭头、`\text{}`、多行。不支持的命令**原样保留**，不会变成乱码。

### 三种写法都能渲染

```
$x^2 + 1$          带分隔符
\(x^2 + 1\)        LaTeX 分隔符
(5-2)^2 = 9        裸的，不打分隔符也认
```

最后一种最有用 —— 大多数 AI 输出公式时不会打 `$`，只认分隔符的话
等于什么都没渲染。

### ★ 不要逼 AI 打分隔符

很多人（包括我自己一开始）会给模型加这种人设：

> 数学公式一律用 `$...$` 包裹

**在 tiny-md 里没必要，而且有害：**

- 它已经能渲染裸公式，加了纯属多余
- AI 并不稳定遵守，时打时不打，你还得处理两种输出
- 万一目标环境**不支持** `$`（比如把这段文本贴到别处），
  那对 `$` 就成了噪音
- `$` 在正文里还可能被误判成公式边界（比如价格 `100$x` 这种）

**真正需要分隔符的只有一种情况**：边界有歧义。比如

```
面积 S = πr^2，其中 r 是半径
```

裸公式模式会把它整体当公式，效果也还行；但如果你想更精确，
写成 `$S = \pi r^2$` 能明确边界、避免误伤。

**结论：默认什么都不用做。** 别给模型加额外约束，让渲染器去适配
模型的自然输出，而不是反过来。

## 安全

先 `esc()` 再生成标签。所有 XSS 入口都有测试覆盖：

```js
TinyMD.render('<script>alert(1)</script>')   // &lt;script&gt;...
TinyMD.render('[点我](javascript:alert(1))') // 不成链接
TinyMD.render('$<script>x</script>$')        // 公式里也不行
```

链接只放行 `http`/`https`，带 `rel="noopener"`。

## 样式作用域

全部收在 `.tm-body` 下，不会泄漏到宿主页面。CSS 变量带 `--tm-` 前缀：

```css
:root{ --tm-fg:#333; --tm-line:#e2e2e2; }
```

## 体积

约 30KB（未压缩，含内嵌 CSS），gzip 后约 8KB。

## License

MIT
