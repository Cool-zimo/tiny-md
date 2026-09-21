/*!
 * tiny-md · 零依赖 Markdown + LaTeX 渲染器
 *
 * 一个文件，无任何外部依赖，不加载字体、不发网络请求。
 * 用法见 README.md
 *
 * ★ 安全模型：先 esc() 转义，再生成标签。
 *   所以用户/AI 输入里的 <script> 早已变成 &lt;script&gt;，
 *   不可能被当标签执行。反过来（先替换后转义）就是 XSS。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();                      // CommonJS
    } else if (typeof define === 'function' && define.amd) {
        define([], factory);                             // AMD
    } else {
        root.TinyMD = factory();                         // <script>
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

function escCode(s) {
        return String(s).replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
    }

var KW_C = ('const let var function return if else for while do break continue ' +
        'new delete typeof instanceof class extends super this switch case default ' +
        'try catch finally throw async await yield import export from as in of void ' +
        'static get set null undefined true false interface type enum implements ' +
        'public private protected abstract readonly namespace declare').split(' ');

var KW_TYP = ('int char float double long short unsigned signed struct union ' +
        'enum typedef sizeof static const void bool boolean byte final native ' +
        'package synchronized transient volatile strictfp').split(' ');

var KW_PY = ('def class return if elif else for while break continue pass ' +
        'import from as with try except finally raise lambda global nonlocal ' +
        'assert del yield async await None True False and or not is in print ' +
        'self super').split(' ');

var KW_SH = ('if then else elif fi for while do done case esac function ' +
        'return in until select echo export local readonly set unset shift ' +
        'exit trap source alias cd test true false').split(' ');

var KW_SQL = ('select from where insert into values update set delete create ' +
        'table drop alter add primary key foreign references join left right inner ' +
        'outer on group by order having limit offset distinct as and or not null ' +
        'is between like in exists union all view index database').split(' ');

var KW_GO = ('func package import var const type struct interface map chan go ' +
        'defer select switch case default if else for range return break continue ' +
        'nil true false string int bool error make new len cap append').split(' ');

var KW_RS = ('fn let mut const static struct enum impl trait use mod pub self ' +
        'super as where match if else loop while for in return break continue ' +
        'true false Some None Ok Err move ref dyn crate').split(' ');

var HL_SPEC = {
        c:    { kw: KW_C.concat(KW_TYP), com: [['//', '\n'], ['/*', '*/']], str: ['"', "'"] },
        js:   { kw: KW_C, com: [['//', '\n'], ['/*', '*/']], str: ['"', "'", '`'] },
        json: { kw: ['true', 'false', 'null'], com: [], str: ['"'] },
        py:   { kw: KW_PY, com: [['#', '\n']], str: ['"', "'"], tri: true },
        sh:   { kw: KW_SH, com: [['#', '\n']], str: ['"', "'"] },
        sql:  { kw: KW_SQL, com: [['--', '\n'], ['/*', '*/']], str: ["'", '"'] },
        go:   { kw: KW_GO, com: [['//', '\n'], ['/*', '*/']], str: ['"', "'", '`'] },
        rs:   { kw: KW_RS, com: [['//', '\n'], ['/*', '*/']], str: ['"', "'"] },
        css:  { kw: ['@media', '@import', '@keyframes', '@font-face', '@supports'],
                com: [['/*', '*/']], str: ['"', "'"], css: true },
        yaml: { kw: ['true', 'false', 'null', 'yes', 'no'], com: [['#', '\n']], str: ['"', "'"] },
        html: { kw: [], com: [['<!--', '-->']], str: ['"', "'"], html: true },
        xml:  { kw: [], com: [['<!--', '-->']], str: ['"', "'"], html: true }
    };

var HL_ALIAS = {
        javascript: 'js', typescript: 'js', jsx: 'js', tsx: 'js', ts: 'js',
        mjs: 'js', cjs: 'js', vue: 'html',
        python: 'py', py3: 'py', python3: 'py',
        bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', terminal: 'sh',
        'c++': 'c', cpp: 'c', 'c#': 'c', csharp: 'c', java: 'c',
        kotlin: 'c', swift: 'c', php: 'c', scala: 'c', dart: 'c',
        golang: 'go', rust: 'rs', scss: 'css', less: 'css',
        yml: 'yaml', htm: 'html', markup: 'html', svg: 'xml',
        mysql: 'sql', psql: 'sql', sqlite: 'sql'
    };

var _KWSET = {};
    (function () {
        Object.keys(HL_SPEC).forEach(function (k) {
            var set = {};
            HL_SPEC[k].kw.forEach(function (w) { set[w] = 1; });
            _KWSET[k] = set;
        });
    })();

var TRIP_SQ = "''" + "'";


var TRIP_DQ = '""' + '"';


var _hlCache = {};
    var _hlKeys = [];

function hl(code, lang) {
        code = String(code == null ? '' : code);

        var L = String(lang || '').toLowerCase();
        var name = HL_SPEC[L] ? L : (HL_ALIAS[L] || 'c');
        var S = HL_SPEC[name] || HL_SPEC.c;
        var kws = _KWSET[name] || {};

        var ck = name + '\u0000' + code;
        if (_hlCache[ck] !== undefined) return _hlCache[ck];

        var out = '';
        var i = 0, n = code.length;

        while (i < n) {
            var ch = code[i];

            // ① 注释（最优先，里面的东西都不该被高亮）
            var coms = S.com || [];
            var moved = false;
            for (var ci = 0; ci < coms.length; ci++) {
                var a = coms[ci][0], b = coms[ci][1];
                if (code.substr(i, a.length) !== a) continue;
                var e;
                if (b === '\n') { e = code.indexOf('\n', i); if (e < 0) e = n; }
                else { e = code.indexOf(b, i + a.length); e = e < 0 ? n : e + b.length; }
                out += '<span class="hl-com">' + escCode(code.slice(i, e)) + '</span>';
                i = e; moved = true; break;
            }
            if (moved) continue;

            // ② 字符串
            if (S.str && S.str.indexOf(ch) >= 0) {
                var trip = code.substr(i, 3);
                if (S.tri && (trip === TRIP_SQ || trip === TRIP_DQ)) {
                    var te = code.indexOf(trip, i + 3);
                    te = te < 0 ? n : te + 3;
                    out += '<span class="hl-str">' + escCode(code.slice(i, te)) + '</span>';
                    i = te; continue;
                }
                var j = i + 1;
                while (j < n) {
                    if (code[j] === '\\') { j += 2; continue; }
                    if (code[j] === ch) { j++; break; }
                    if (code[j] === '\n') break;      // 不跨行
                    j++;
                }
                out += '<span class="hl-str">' + escCode(code.slice(i, j)) + '</span>';
                i = j; continue;
            }

            // ③ HTML 标签名
            if (S.html && ch === '<' && /[a-zA-Z!/]/.test(code[i + 1] || '')) {
                var m = /^<\/?([a-zA-Z][\w-]*)/.exec(code.slice(i));
                if (m) {
                    out += '&lt;' + (code[i + 1] === '/' ? '/' : '') +
                        '<span class="hl-tag">' + escCode(m[1]) + '</span>';
                    i += m[0].length;
                    continue;
                }
            }

            // ④ 数字
            if (/[0-9]/.test(ch) && !/[\w$]/.test(code[i - 1] || '')) {
                var nm = /^(0[xX][0-9a-fA-F]+|\d+(\.\d+)?([eE][+-]?\d+)?)/.exec(code.slice(i));
                if (nm) {
                    out += '<span class="hl-num">' + escCode(nm[1]) + '</span>';
                    i += nm[1].length;
                    continue;
                }
            }

            // ⑤ 标识符：关键字 / 函数 / 常量 / 普通
            if (/[A-Za-z_$@]/.test(ch)) {
                // ★ 必须有捕获组：写成 /^[A-Za-z_$@][\w$]*/ 的话 idm[1] 是
                //   undefined，后面 w.length 直接抛错 —— 整个代码块渲染崩掉
                var idm = /^([A-Za-z_$@][\w$]*)/.exec(code.slice(i));
                if (idm) {
                    var w = idm[1];
                    if (kws[w]) {
                        out += '<span class="hl-kw">' + escCode(w) + '</span>';
                    } else if (code[i + w.length] === '(') {
                        out += '<span class="hl-fn">' + escCode(w) + '</span>';
                    } else if (/^[A-Z][A-Z0-9_]+$/.test(w)) {
                        out += '<span class="hl-const">' + escCode(w) + '</span>';
                    } else {
                        out += escCode(w);
                    }
                    i += w.length;
                    continue;
                }
            }

            // ⑥ 运算符
            if ('+-*/%=<>!&|^~?:'.indexOf(ch) >= 0) {
                out += '<span class="hl-op">' + escCode(ch) + '</span>';
                i++; continue;
            }

            out += escCode(ch);
            i++;
        }

        _hlCache[ck] = out;
        _hlKeys.push(ck);
        if (_hlKeys.length > 60) delete _hlCache[_hlKeys.shift()];
        return out;
    }

function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

var TEX_SYM = {
        // 希腊字母
        'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ',
        'epsilon': 'ε', 'varepsilon': 'ε', 'zeta': 'ζ', 'eta': 'η',
        'theta': 'θ', 'vartheta': 'θ', 'iota': 'ι', 'kappa': 'κ',
        'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'pi': 'π',
        'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ',
        'phi': 'φ', 'varphi': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
        'Gamma': 'Γ', 'Delta': 'Δ', 'Theta': 'Θ', 'Lambda': 'Λ',
        'Xi': 'Ξ', 'Pi': 'Π', 'Sigma': 'Σ', 'Phi': 'Φ', 'Psi': 'Ψ',
        'Omega': 'Ω',
        // 运算符 / 关系
        'times': '×', 'div': '÷', 'pm': '±', 'mp': '∓',
        'cdot': '·', 'ast': '∗', 'circ': '∘', 'bullet': '•',
        'le': '≤', 'leq': '≤', 'ge': '≥', 'geq': '≥',
        'neq': '≠', 'ne': '≠', 'approx': '≈', 'equiv': '≡',
        'sim': '∼', 'simeq': '≃', 'propto': '∝',
        'll': '≪', 'gg': '≫', 'subset': '⊂', 'supset': '⊃',
        'subseteq': '⊆', 'supseteq': '⊇', 'in': '∈',
        'notin': '∉', 'cup': '∪', 'cap': '∩',
        'infty': '∞', 'partial': '∂', 'nabla': '∇',
        'forall': '∀', 'exists': '∃', 'neg': '¬',
        'wedge': '∧', 'vee': '∨', 'oplus': '⊕', 'otimes': '⊗',
        'to': '→', 'rightarrow': '→', 'Rightarrow': '⇒',
        'leftarrow': '←', 'Leftarrow': '⇐',
        'leftrightarrow': '↔', 'Leftrightarrow': '⇔',
        'mapsto': '↦', 'uparrow': '↑', 'downarrow': '↓',
        'sum': '∑', 'prod': '∏', 'int': '∫', 'iint': '∬',
        'oint': '∮', 'lim': 'lim', 'log': 'log', 'ln': 'ln',
        'sin': 'sin', 'cos': 'cos', 'tan': 'tan',
        'cot': 'cot', 'sec': 'sec', 'csc': 'csc',
        'arcsin': 'arcsin', 'arccos': 'arccos', 'arctan': 'arctan',
        'max': 'max', 'min': 'min', 'sup': 'sup', 'inf': 'inf',
        'deg': '°', 'prime': '′', 'angle': '∠',
        'perp': '⊥', 'parallel': '∥', 'therefore': '∴',
        'because': '∵', 'dots': '…', 'cdots': '⋯',
        'ldots': '…', 'vdots': '⋮', 'ddots': '⋱',
        'quad': ' ', 'qquad': ' ', 'hspace': '',
        'left': '', 'right': '', 'big': '', 'Big': '',
        'bigg': '', 'Bigg': '', 'displaystyle': '',
        'limits': '', 'nolimits': '', 'bmod': 'mod'
    };

function _matchBrace(s, i) {
        if (s[i] !== '{') return -1;
        var d = 0;
        for (var j = i; j < s.length; j++) {
            if (s[j] === '{') d++;
            else if (s[j] === '}') {
                d--;
                if (d === 0) return j;
            }
        }
        return -1;                       // 不闭合 → 放弃，原样显示
    }

function _grp(s) {
        if (s[0] !== '{') return null;
        var e = _matchBrace(s, 0);
        return e < 0 ? null : s.slice(1, e);
    }

function _looksMath(ln) {
        var t = ln.trim();
        if (!t) return false;
        if (t.length > 400) return false;            // 太长的整段，八成是正文

        // 明确的 LaTeX 命令 → 一定是公式
        if (/\\[a-zA-Z]{2,}/.test(t)) return true;

        // 含上下标
        if (/[\^_]/.test(t)) {
            // 排除 URL / 路径（里面可能有 _ 或 %5E）
            if (/https?:\/\//i.test(t)) return false;
            if (/^[\w./-]+\.(js|py|json|md|css|html)$/i.test(t.trim())) return false;
            // 中文占比过高 → 当自然语言
            var han = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
            if (han / t.length > 0.5) return false;
            return true;
        }
        return false;
    }

function _inlineMath(t, holds) {
        t = String(t == null ? '' : t);

        if (!/[\^_]/.test(t)) {
            // 没有上下标，但可能有明确 LaTeX 命令（\frac 之类）
            if (/\\[a-zA-Z]{2,}/.test(t) && !/https?:\/\//i.test(t) && _looksMath(t)) {
                holds.push('<span class="math math-inline">' + tex(t.trim()) + '</span>');
                return '\u0001H' + (holds.length - 1) + '\u0001';
            }
            return esc(t);
        }
        // URL 里可能有 _ 或 %5E，整行放过
        if (/https?:\/\//i.test(t)) return esc(t);
        // 文件名 my_file_name.js 里的 _ 不是下标
        if (/^[\w./-]+\.[a-zA-Z0-9]{1,6}$/.test(t.trim())) return esc(t);

        var out = '';
        var start = 0;          // ★ 未处理文本的起点
        var i = 0;

        while (i < t.length) {
            if ((t[i] === '^' || t[i] === '_') && i > 0) {
                // ‑‑ 向左扩展 base ‑‑
                // ★ 必须支持配对括号：只认字母数字的话，
                //   (5-2)^2 会停在 '-' 上，base 变成 "2)" 而不是 "(5-2)"
                var L = i;
                while (L > start) {
                    var pc = t[L - 1];
                    if (/[0-9A-Za-z\]}]/.test(pc)) { L--; continue; }
                    if (pc === ')') {
                        var d = 0, j = L - 1;
                        for (; j >= start; j--) {
                            if (t[j] === ')') d++;
                            else if (t[j] === '(') { d--; if (d === 0) break; }
                        }
                        if (j >= start && d === 0) { L = j; continue; }
                    }
                    break;
                }

                // ‑‑ 向右扩展 sup/sub ‑‑
                var R = i + 1;
                if (t[R] === '{') {
                    var e = _matchBrace(t, R);
                    if (e >= 0) R = e + 1;
                } else {
                    while (R < t.length && /[0-9A-Za-z]/.test(t[R])) R++;
                }

                if (L >= start && R > i + 1) {
                    // ★ 先把 L 之前的普通文本吐出去，再吐公式
                    //   少了这一步，(5-2)^2 会渲染成 (5-2)  +  (5-2)² —— 重复
                    out += esc(t.slice(start, L));
                    holds.push('<span class="math math-inline">' +
                        tex(t.slice(L, R)) + '</span>');
                    out += '\u0001H' + (holds.length - 1) + '\u0001';
                    start = R;
                    i = R;
                    continue;
                }
            }
            i++;
        }
        out += esc(t.slice(start));
        return out;
    }

function _texLine(s) {
        var out = '';
        var i = 0;

        while (i < s.length) {
            var c = s[i];

            // ── \命令 ────────────────────────────────────
            if (c === '\\') {
                // 取命令名（字母，或单个非字母字符）
                var m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i));
                if (!m) { out += esc('\\'); i++; continue; }
                var cmd = m[1];
                var rest = s.slice(i + 1 + cmd.length);

                // \text{...} / \mathrm{...} → 普通文字
                if (cmd === 'text' || cmd === 'mathrm' || cmd === 'mathbf' ||
                    cmd === 'textit' || cmd === 'textrm') {
                    var g0 = _grp(rest);
                    if (g0 !== null) {
                        out += esc(g0);
                        i += 1 + cmd.length + g0.length + 2;
                        continue;
                    }
                }

                // \frac{a}{b}
                if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
                    var ga = _grp(rest);
                    if (ga !== null) {
                        var after = rest.slice(ga.length + 2);
                        var gb = _grp(after);
                        if (gb !== null) {
                            out += '<span class="mfrac">' +
                                '<span class="mnum">' + _texLine(ga) + '</span>' +
                                '<span class="mden">' + _texLine(gb) + '</span>' +
                                '</span>';
                            i += 1 + cmd.length + (ga.length + 2) + (gb.length + 2);
                            continue;
                        }
                    }
                }

                // \sqrt[n]{x} → 只渲染成普通根号（n 次根号样式太复杂）
                if (cmd === 'sqrt') {
                    var g1 = _grp(rest);
                    if (g1 !== null) {
                        out += '<span class="msqrt">' +
                            '<span class="mrad">√</span>' +
                            '<span class="mbody">' + _texLine(g1) + '</span>' +
                            '</span>';
                        i += 1 + cmd.length + g1.length + 2;
                        continue;
                    }
                    // \sqrt2 这种无花括号的
                    var sm = /^([0-9a-zA-Z])/.exec(rest);
                    if (sm) {
                        out += '<span class="msqrt"><span class="mrad">√</span>' +
                            '<span class="mbody">' + esc(sm[1]) + '</span></span>';
                        i += 1 + cmd.length + 1;
                        continue;
                    }
                }

                // \overline{x} / \hat{x} / \vec{x}
                if (cmd === 'overline' || cmd === 'bar') {
                    var g2 = _grp(rest);
                    if (g2 !== null) {
                        out += '<span class="mover">' + _texLine(g2) + '</span>';
                        i += 1 + cmd.length + g2.length + 2;
                        continue;
                    }
                }
                if (cmd === 'hat' || cmd === 'widehat' || cmd === 'vec' ||
                    cmd === 'tilde' || cmd === 'dot') {
                    var g3 = _grp(rest);
                    if (g3 !== null) {
                        out += '<span class="mhat">' + _texLine(g3) + '</span>';
                        i += 1 + cmd.length + g3.length + 2;
                        continue;
                    }
                }

                // 符号表
                if (TEX_SYM[cmd] !== undefined) {
                    out += esc(TEX_SYM[cmd]);
                    i += 1 + cmd.length;
                    continue;
                }

                // 未知命令：原样保留（比显示乱码强）
                out += esc('\\' + cmd);
                i += 1 + cmd.length;
                continue;
            }

            // ── ^ 上标 ────────────────────────────────────
            if (c === '^') {
                var supG = _grp(s.slice(i + 1));
                if (supG !== null) {
                    out += '<sup>' + _texLine(supG) + '</sup>';
                    i += 2 + supG.length + 1;
                    continue;
                }
                var sup1 = /^([0-9a-zA-Z])/.exec(s.slice(i + 1));
                if (sup1) {
                    out += '<sup>' + esc(sup1[1]) + '</sup>';
                    i += 2;
                    continue;
                }
                out += esc('^'); i++; continue;
            }

            // ── _ 下标 ────────────────────────────────────
            if (c === '_') {
                var subG = _grp(s.slice(i + 1));
                if (subG !== null) {
                    out += '<sub>' + _texLine(subG) + '</sub>';
                    i += 2 + subG.length + 1;
                    continue;
                }
                var sub1 = /^([0-9a-zA-Z])/.exec(s.slice(i + 1));
                if (sub1) {
                    out += '<sub>' + esc(sub1[1]) + '</sub>';
                    i += 2;
                    continue;
                }
                out += esc('_'); i++; continue;
            }

            // ── 普通字符 ──────────────────────────────────
            // 花括号只是分组，不显示
            if (c === '{' || c === '}') { i++; continue; }
            out += esc(c);
            i++;
        }
        return out;
    }

function tex(src) {
        src = String(src == null ? '' : src);
        if (!src.trim()) return '';

        // 多行：\\ 或 \cr → 换行
        var lines = src.split(/\\\\|\\cr/);

        var out = lines.map(function (ln) {
            return _texLine(ln);
        }).join('<br>');

        return out;
    }

function extractMath(text, holds) {
        var out = '';
        var i = 0;

        while (i < text.length) {
            // \(...\)  行内（LaTeX 标准分隔符，很多模型爱用）
            if (text[i] === '\\' && text[i + 1] === '(') {
                var pe = text.indexOf('\\)', i + 2);
                if (pe > i + 1) {
                    var pb = text.slice(i + 2, pe);
                    if (pb.trim()) {
                        holds.push('<span class="math math-inline">' +
                            tex(pb) + '</span>');
                        out += '\u0001H' + (holds.length - 1) + '\u0001';
                        i = pe + 2;
                        continue;
                    }
                }
                out += text[i]; i++; continue;
            }

            // \[...\]  块级
            if (text[i] === '\\' && text[i + 1] === '[') {
                var be = text.indexOf('\\]', i + 2);
                if (be > i + 1) {
                    var bb = text.slice(i + 2, be);
                    if (bb.trim()) {
                        holds.push('<span class="math math-block">' +
                            tex(bb) + '</span>');
                        out += '\u0001H' + (holds.length - 1) + '\u0001';
                        i = be + 2;
                        continue;
                    }
                }
                out += text[i]; i++; continue;
            }

            // $$ ... $$  块级
            if (text[i] === '$' && text[i + 1] === '$') {
                var e2 = text.indexOf('$$', i + 2);
                if (e2 > i + 1) {
                    var body = text.slice(i + 2, e2);
                    if (body.trim()) {
                        holds.push('<span class="math math-block">' +
                            tex(body) + '</span>');
                        out += '\u0001H' + (holds.length - 1) + '\u0001';
                        i = e2 + 2;
                        continue;
                    }
                }
                // 没闭合：原样吐出，别吞掉后面的正文
                out += text[i]; i++; continue;
            }

            // $ ... $  行内
            if (text[i] === '$') {
                var e1 = text.indexOf('$', i + 1);
                // 行内公式不能跨行，且不能是空的
                if (e1 > i + 1 && text.slice(i + 1, e1).indexOf('\n') < 0) {
                    var b1 = text.slice(i + 1, e1);
                    if (b1.trim()) {
                        holds.push('<span class="math math-inline">' +
                            tex(b1) + '</span>');
                        out += '\u0001H' + (holds.length - 1) + '\u0001';
                        i = e1 + 1;
                        continue;
                    }
                }
                out += text[i]; i++; continue;
            }

            out += text[i]; i++;
        }
        return out;
    }

function md(s) {
        if (s === null || s === undefined) return '';
        var holds = [];   // 存抽出来的 HTML 片段（代码块 / 行内 code）

        function inline(x) {
            // ⓪ 数学公式（最先 —— \ { } ^ _ 不能被后面的规则碰）
            x = extractMath(x, holds);

            // ① 行内 code（最优先，内容原样，不接受任何后续规则）
            x = x.replace(/`([^`\n]+)`/g, function (m, c) {
                holds.push('<code>' + c + '</code>');
                return '\u0001H' + (holds.length - 1) + '\u0001';
            });

            // ② 图片 ![alt](url)
            x = x.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, function (m, alt, u) {
                if (!/^https?:\/\//i.test(u)) return m;
                holds.push('<img class="msg-img" src="' + esc(u) + '"' +
                    ' alt="' + esc(alt) + '" loading="lazy">');
                return '\u0001H' + (holds.length - 1) + '\u0001';
            });

            // ③ [文字](url) —— 也必须占位，否则第④步会把 href 里的
            //    URL 又识别成裸链接，套出 <a><a> 这种烂结构
            x = x.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (m, t, u) {
                if (!/^https?:\/\//i.test(u)) return m;
                holds.push('<a href="' + esc(u) + '"' +
                    ' target="_blank" rel="noopener">' + t + '</a>');
                return '\u0001H' + (holds.length - 1) + '\u0001';
            });

            // ④ 裸 URL 自动成链接
            x = x.replace(/(^|[\s(])(https?:\/\/[^\s<)"'\]]+)/g,
                function (m, pre, u) {
                    holds.push('<a href="' + u + '"' +
                        ' target="_blank" rel="noopener">' + u + '</a>');
                    return pre + '\u0001H' + (holds.length - 1) + '\u0001';
                });

            // ⑤ 强调类
            x = x.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
            x = x.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
            x = x.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
            x = x.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
            return x;
        }

        function blk(src) {
            var ln = src.split('\n');
            var out = '', list = null, buf = [];

            function flushP() {
                if (!buf.length) return;
                out += '<p>' + inline(buf.join('<br>')) + '</p>';
                buf = [];
            }
            function closeL() {
                if (list) { out += '</' + (list === 'ulTask' ? 'ul' : list) + '>'; list = null; }
            }

            for (var i = 0; i < ln.length; i++) {
                var raw = ln[i];
                // ★ rt = 原始行，只用于**判断**语法类型
                //   t  = 转义后，用于**渲染**
                //   两者必须分开：'>' 转义后是 '&gt;'，拿去匹配 /^>/
                //   永远匹配不上，引用就会退化成普通段落。
                var rt = raw.trim();
                var t = esc(raw).trim();

                if (!rt) { flushP(); closeL(); continue; }

                // 整行就是占位符 → 块级元素，直接吐出去，别裹 <p>
                var ph = /^\u0001H(\d+)\u0001$/.exec(rt);
                if (ph) { flushP(); closeL(); out += '\u0001H' + ph[1] + '\u0001'; continue; }

                // ★ 整行就一张图 → 块级吐出，别裹进 <p>
                //   占位符是在 inline() 里才生成的，而整行判定在这之前，
                //   所以这里得直接认 markdown 原文，不能靠占位符判断。
                if (/^!\[[^\]\n]*\]\(https?:\/\/[^)\s]+\)$/i.test(rt)) {
                    flushP(); closeL();
                    out += inline(esc(rt));
                    continue;
                }
                var h = /^(#{1,6})\s+(.*)$/.exec(rt);
                if (h) {
                    flushP(); closeL();
                    var lv = h[1].length;
                    out += '<h' + lv + '>' + inline(esc(h[2])) + '</h' + lv + '>';
                    continue;
                }
                if (/^(-{3,}|\*{3,}|_{3,})$/.test(rt)) {
                    flushP(); closeL(); out += '<hr>'; continue;
                }
                if (/^>\s?/.test(rt)) {
                    flushP(); closeL();
                    out += '<blockquote>' +
                        inline(esc(rt.replace(/^>\s?/, ''))) + '</blockquote>';
                    continue;
                }
                // ★ 任务列表必须排在普通 ul 之前：
                //   '- [ ] x' 同样满足 /^[-*+]\s+/，放后面就永远轮不到
                var tk = /^[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(rt);
                if (tk) {
                    flushP();
                    if (list !== 'ulTask') {
                        closeL();
                        out += '<ul class="task">';
                        list = 'ulTask';
                    }
                    var done = tk[1].toLowerCase() === 'x';
                    // disabled：只是展示 AI 给的结果，不是让你真去勾选
                    out += '<li class="task-item' + (done ? ' done' : '') + '">' +
                        '<input type="checkbox" disabled' + (done ? ' checked' : '') + '>' +
                        inline(esc(tk[2])) + '</li>';
                    continue;
                }
                var ul = /^[-*+]\s+(.*)$/.exec(rt);
                if (ul) {
                    flushP();
                    if (list !== 'ul') { closeL(); out += '<ul>'; list = 'ul'; }
                    out += '<li>' + inline(esc(ul[1])) + '</li>';
                    continue;
                }
                var ol = /^\d+[.)]\s+(.*)$/.exec(rt);
                if (ol) {
                    flushP();
                    if (list !== 'ol') { closeL(); out += '<ol>'; list = 'ol'; }
                    out += '<li>' + inline(esc(ol[1])) + '</li>';
                    continue;
                }
                // 表格
                if (/^\|/.test(rt)) {
                    flushP(); closeL();
                    var rows = [];
                    while (i < ln.length && /^\s*\|/.test(ln[i])) {
                        rows.push(ln[i].trim().replace(/^\||\|$/g, '').split('|'));
                        i++;
                    }
                    i--;
                    // 去掉 |---|---| 那条分隔行
                    if (rows.length > 1 && /^[-: |]+$/.test(rows[1].join(''))) rows.splice(1, 1);
                    var tb = '<table>';
                    for (var r = 0; r < rows.length; r++) {
                        tb += '<tr>';
                        for (var c = 0; c < rows[r].length; c++) {
                            var v = esc(rows[r][c].trim());
                            tb += (r === 0 ? '<th>' : '<td>') + inline(v) +
                                  (r === 0 ? '</th>' : '</td>');
                        }
                        tb += '</tr>';
                    }
                    out += tb + '</table>';
                    continue;
                }
                // ★ 裸公式：模型经常不打分隔符，直接写 a^2 + b^2。
                //   ★ 必须"最小单元"渲染，不能整行 ——
                //     整行渲染会被中文占比卡住（"假设 a=5，那么 (5-2)^2 = 9"
                //     中文过半就会被判成正文而漏掉）。
                //     只渲染 base^sup 这一小段，其余文字原样走普通段落。
                buf.push(_inlineMath(raw, holds));
            }
            flushP(); closeL();
            return out;
        }

        // ── 主流程：先抽代码块 ─────────────────────────────
        var parts = String(s).split('```');
        var body = '';
        for (var i = 0; i < parts.length; i++) {
            if (i % 2 === 1) {
                // 语言标记（```python）。字符集要含 + # - . 否则 c++ / c# 认不出
                var lm = /^([a-zA-Z0-9+#._-]*)\n/.exec(parts[i]);
                var lang = lm ? lm[1] : '';
                var code = parts[i].replace(/^[a-zA-Z0-9+#._-]*\n/, '');
                // 含换行 = 块级 <pre>；不含 = 行内 <code>
                var isBlock = code.indexOf('\n') >= 0;
                if (isBlock) {
                    holds.push(
                        '<div class="codeblk">' +
                          '<div class="code-top">' +
                            '<span class="lang">' + esc(lang || 'code') + '</span>' +
                            '<button class="copy-btn" type="button">复制</button>' +
                          '</div>' +
                          '<pre><code class="hl">' + hl(code, lang) + '</code></pre>' +
                        '</div>');
                } else {
                    holds.push('<code>' + esc(code) + '</code>');
                }
                body += '\u0001H' + (holds.length - 1) + '\u0001';
            } else {
                // ★ 公式必须在代码块之外、esc 之前抽
                //   代码里的 $ 是 shell 变量，不能被当公式
                body += extractMath(parts[i], holds);
            }
        }

        var html = blk(body);
        // 还原占位符
        html = html.replace(/\u0001H(\d+)\u0001/g, function (m, n) {
            return holds[Number(n)] || '';
        });
        return html;
    }

    // ══════════════════════════════════════════════════════
    //  对外接口
    // ══════════════════════════════════════════════════════

    var CSS = '/* ═══════════════════════════════════════════════════════════ tiny-md 样式 ★ 全部收在 .tm-body 下，绝不泄漏到宿主页面 （<h2> <table> 这类裸元素选择器会污染整站，必须作用域化） ★ 变量全部带 --tm- 前缀并给了兜底值， 不会跟宿主页面的 --brand / --dur 之类的变量撞车 ═══════════════════════════════════════════════════════════ */ .tm-body{font-size:14px;line-height:1.65;color:var(--tm-fg,#222)} /* ── 段落 / 标题 ─────────────────────────────────────────── */ .tm-body p{margin:0 0 8px} .tm-body p:last-child{margin-bottom:0} .tm-body h1,.tm-body h2,.tm-body h3, .tm-body h4,.tm-body h5,.tm-body h6{ margin:14px 0 6px;font-weight:600;line-height:1.35} .tm-body h1{font-size:20px} .tm-body h2{font-size:17px} .tm-body h3{font-size:15.5px} .tm-body h4{font-size:14.5px} .tm-body h5,.tm-body h6{font-size:14px} /* ── 列表 ────────────────────────────────────────────────── */ .tm-body ul,.tm-body ol{margin:6px 0 10px;padding-left:24px} .tm-body li{margin:3px 0} /* ── 引用 / 分隔线 ───────────────────────────────────────── */ .tm-body blockquote{ margin:8px 0;padding:6px 12px;border-left:3px solid var(--tm-line,#d8d8d8); color:#666;background:rgba(0,0,0,.035);border-radius:0 4px 4px 0} .tm-body hr{border:0;border-top:1px solid var(--tm-line,#e5e5e5);margin:12px 0} /* ── 表格 ────────────────────────────────────────────────── */ .tm-body table{ border-collapse:collapse;margin:8px 0;font-size:13.5px; display:block;overflow-x:auto;max-width:100%} .tm-body th,.tm-body td{ border:1px solid var(--tm-line,#e2e2e2);padding:6px 11px;text-align:left} .tm-body th{background:rgba(0,0,0,.045);font-weight:600} /* ── 行内元素 ────────────────────────────────────────────── */ .tm-body a{color:#576b95;text-decoration:none;word-break:break-all} .tm-body a:hover{text-decoration:underline} .tm-body mark{background:#fff3a3;color:inherit;border-radius:2px;padding:0 2px} .tm-body code{ background:rgba(0,0,0,.06);border-radius:3px;padding:1px 5px; font-size:13px;font-family:ui-monospace,Menlo,Consolas,monospace} .tm-body sup,.tm-body sub{font-size:.72em;line-height:1} .tm-body sup{vertical-align:super} .tm-body sub{vertical-align:sub} /* ── 代码块 ──────────────────────────────────────────────── */ .tm-body pre{ background:#f6f6f6;border-radius:6px;padding:10px 12px; overflow-x:auto;margin:8px 0;font-size:12.5px;line-height:1.55; border:1px solid rgba(0,0,0,.07); font-family:ui-monospace,Menlo,Consolas,monospace} .tm-body pre code{background:none;padding:0;font-size:12.5px} .codeblk{ margin:8px 0;border-radius:6px;overflow:hidden; border:1px solid rgba(0,0,0,.09);background:#f6f6f6} .code-top{ display:flex;align-items:center;gap:8px;padding:4px 10px; background:#ececec;border-bottom:1px solid rgba(0,0,0,.07)} .code-top .lang{ flex:1;font-size:11px;color:#888; font-family:ui-monospace,Menlo,Consolas,monospace;text-transform:lowercase} .copy-btn{ border:0;background:#fff;border:1px solid rgba(0,0,0,.12); border-radius:4px;font-size:11px;padding:2px 9px;color:#555;cursor:pointer; transition:.15s ease} .copy-btn:hover{color:#07c160;border-color:#07c160} .copy-btn.done{color:#07c160;border-color:#07c160;background:#f2fbf5} .codeblk pre{margin:0;border:0;border-radius:0;background:#f6f6f6} /* ── 图片 ────────────────────────────────────────────────── */ .tm-body img.msg-img{ display:block;max-width:100%;max-height:340px;border-radius:6px; margin:6px 0;background:#f0f0f0} .tm-body img.msg-img.img-err{ min-width:120px;min-height:60px;border:1px dashed #ccc; background:#fafafa} /* ── 任务列表（只读展示） ───────────────────────────────── */ .tm-body ul.task{list-style:none;padding-left:2px;margin:6px 0 10px} .tm-body li.task-item{display:flex;align-items:flex-start;gap:7px;margin:3px 0} .tm-body li.task-item input{margin:4px 0 0;flex:0 0 auto;accent-color:#07c160} .tm-body li.task-item.done{color:#999;text-decoration:line-through} /* ═══ LaTeX 数学公式 ═══════════════════════════════════════ */ .tm-body .math{ font-family:"Latin Modern Math",Cambria,"Times New Roman",serif; line-height:1.5;font-style:normal} .tm-body .math-inline{display:inline} .tm-body .math-block{ display:block;margin:10px 0;padding:8px 12px; background:rgba(0,0,0,.03);border-radius:5px; text-align:center;font-size:15.5px;overflow-x:auto} /* 分数 */ .mfrac{display:inline-flex;flex-direction:column; vertical-align:middle;text-align:center;margin:0 2px;font-size:.92em} .mnum{padding:0 4px;border-bottom:1px solid currentColor;line-height:1.25} .mden{padding:0 4px;line-height:1.25} /* 根号：上横线盖住被开方数 */ .msqrt{display:inline-flex;align-items:stretch;margin:0 1px} .mrad{position:relative;line-height:1} .mbody{border-top:1px solid currentColor;padding:0 2px;margin-top:.32em} /* 上划线 / 帽子 */ .mover{border-top:1px solid currentColor;padding-top:1px} .mhat{position:relative;padding-top:.3em} .mhat::before{content:\'^\';position:absolute;top:-.15em;left:50%; transform:translateX(-50%);font-size:.75em}';

    /**
     * 把样式插进当前页面（幂等，重复调用无害）
     * 不传参就用自己的容器类名 .tm-body
     */
    function injectCSS(doc) {
        doc = doc || (typeof document !== 'undefined' ? document : null);
        if (!doc) return false;
        if (doc.getElementById('tm-style')) return false;
        var st = doc.createElement('style');
        st.id = 'tm-style';
        st.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(st);
        return true;
    }

    var API = {
        version: '1.1.0',

        /** 渲染 Markdown（含 LaTeX）→ HTML 字符串 */
        render: function (s) { return md(s); },

        /** 只渲染一段 LaTeX → HTML 字符串 */
        renderTex: function (s) { return tex(s); },

        /** 只做代码高亮 → HTML 字符串 */
        highlight: function (code, lang) { return hl(code, lang); },

        /** 转义（自己拼 HTML 时用它） */
        esc: function (s) { return esc(s); },

        /**
         * 渲染并塞进元素
         * @param el   目标元素（或 id 字符串）
         * @param text Markdown 原文
         * @param opt  {cls:'tm-body', style:true}
         */
        renderInto: function (el, text, opt) {
            opt = opt || {};
            var d = (typeof document !== 'undefined') ? document : null;
            if (typeof el === 'string' && d) el = d.getElementById(el);
            if (!el) return null;
            if (opt.style !== false) injectCSS(el.ownerDocument || d);
            el.classList.add(opt.cls || 'tm-body');
            el.innerHTML = md(text);
            return el;
        },

        injectCSS: injectCSS,

        /** 一口气把页面上所有 <script type="text/tiny-md"> 渲染出来 */
        auto: function () {
            var d = (typeof document !== 'undefined') ? document : null;
            if (!d) return 0;
            injectCSS(d);
            var ns = d.querySelectorAll('script[type="text/tiny-md"]');
            var n = 0;
            for (var i = 0; i < ns.length; i++) {
                var box = d.createElement('div');
                box.className = 'tm-body';
                box.innerHTML = md(ns[i].textContent);
                if (ns[i].parentNode) {
                    ns[i].parentNode.insertBefore(box, ns[i]);
                }
                n++;
            }
            return n;
        }
    };

    return API;
}));
