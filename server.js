const express = require('express');
const cors = require('cors');
const path = require('path');
const { URL } = require('url');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;

// CORSを有効にする
app.use(cors()); 

// 静的ファイルを配信 (index.htmlなど)
app.use(express.static(__dirname));

/**
 * HTMLコンテンツ内のリソースURLをプロキシURLに書き換える関数
 * a, formに加え、img, link (CSS), script (JS) に対応
 * * @param {string} html - 書き換え対象のHTMLコンテンツ
 * @param {string} originalUrl - 元のページの絶対URL (相対パス解決用)
 * @returns {string} 書き換え後のHTMLコンテンツ
 */
function rewriteHtmlContent(html, originalUrl) {
    const $ = cheerio.load(html);
    const baseUrl = new URL(originalUrl);
    const proxyPrefix = '/proxy?url=';

    // 書き換え対象の要素セレクタを拡張: a, form, img, CSSのlink, script を追加
    const selectors = 'a, form, img, link[rel="stylesheet"], script'; 

    $(selectors).each((i, element) => {
        const tagName = $(element).get(0).tagName;
        let attribute = '';
        
        // タグの種類に応じて、書き換え対象の属性を決定
        switch (tagName) {
            case 'a':
                attribute = 'href';
                break;
            case 'form':
                attribute = 'action';
                break;
            case 'img':
                attribute = 'src'; // 画像
                break;
            case 'link': // CSSファイルなど
            case 'script': // JavaScriptファイル
                // 属性として 'href' (linkタグ) または 'src' (script, imgタグ) を使用
                attribute = 'href' in $(element).attr() ? 'href' : 'src'; 
                break;
            default:
                return; // 対象外のタグはスキップ
        }

        let originalPath = $(element).attr(attribute);

        // 有効なパスがあり、data URLではない場合のみ処理
        if (originalPath && !originalPath.startsWith('data:')) {
            try {
                // 1. 相対パスを絶対URLに変換
                const absoluteUrl = new URL(originalPath, baseUrl).href;
                // 2. プロキシ経由のURLに変換
                const proxiedUrl = proxyPrefix + encodeURIComponent(absoluteUrl);
                
                // 3. 属性値を書き換え
                $(element).attr(attribute, proxiedUrl);
                
                // formタグの場合は、method属性の欠落を防ぐ
                if (tagName === 'form') {
                    $(element).attr('method', $(element).attr('method') || 'GET');
                }
            } catch (e) {
                // URL変換エラーが発生しても処理は続行
            }
        }
    });

    // <base>タグは相対URLの解決を混乱させるため削除
    $('base').remove();

    return $.html();
}

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send({ error: 'URLパラメータが不足しています。' });
    }

    let urlObj;
    try {
        urlObj = new URL(targetUrl);
    } catch (e) {
        return res.status(400).send({ error: '無効なURL形式です。' });
    }

    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return res.status(403).send({ error: 'HTTPまたはHTTPSプロトコルのみ許可されています。' });
    }

    console.log(`[PROXY] ターゲットURL: ${targetUrl}`);

    try {
        // GETリクエストで外部サイトにアクセス
        const response = await fetch(targetUrl, {
            method: 'GET'
        });

        res.status(response.status);
        
        const contentType = response.headers.get('content-type');
        
        // 外部サイトのヘッダーを転送 (不要なヘッダーを除く)
        response.headers.forEach((value, name) => {
            if (!['connection', 'content-encoding', 'transfer-encoding', 'content-length'].includes(name.toLowerCase())) {
                res.setHeader(name, value);
            }
        });

        if (contentType && contentType.includes('text/html')) {
            // HTMLの場合: コンテンツをプロキシURLに書き換えてからレスポンス
            const contentBuffer = await response.arrayBuffer();
            let content = Buffer.from(contentBuffer).toString();
            content = rewriteHtmlContent(content, targetUrl);
            res.end(content);
        } else {
            // HTML以外 (画像、CSS、JSなど) の場合: バイナリとしてそのままレスポンス
            const buffer = await response.arrayBuffer();
            res.end(Buffer.from(buffer));
        }

    } catch (error) {
        console.error(`[ERROR] プロキシ通信失敗: ${error.message}`);
        res.status(500).send({ error: `外部サイトへのアクセスに失敗しました: ${error.message}` });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 プロキシサーバー起動: http://localhost:${PORT}`);
    console.log('クライアントからアクセスして、URLを試してください。');
});
