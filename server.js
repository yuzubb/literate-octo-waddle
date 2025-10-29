const express = require('express');
const cors = require('cors');
const path = require('path');
const { URL } = require('url');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;

app.use(cors()); 

app.use(express.static(__dirname));

function rewriteHtmlContent(html, originalUrl) {
    const $ = cheerio.load(html);
    const baseUrl = new URL(originalUrl);
    const proxyPrefix = '/proxy?url=';

    $('a, form').each((i, element) => {
        const tagName = $(element).get(0).tagName;
        let attribute = tagName === 'a' ? 'href' : 'action';
        let originalPath = $(element).attr(attribute);

        if (originalPath) {
            try {
                const absoluteUrl = new URL(originalPath, baseUrl).href;
                const proxiedUrl = proxyPrefix + encodeURIComponent(absoluteUrl);
                $(element).attr(attribute, proxiedUrl);
                
                if (tagName === 'form') {
                    $(element).attr('method', $(element).attr('method') || 'GET');
                }
            } catch (e) {
            }
        }
    });

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
        const response = await fetch(targetUrl, {
            method: 'GET'
        });

        res.status(response.status);
        
        const contentType = response.headers.get('content-type');
        
        response.headers.forEach((value, name) => {
            if (!['connection', 'content-encoding', 'transfer-encoding', 'content-length'].includes(name.toLowerCase())) {
                res.setHeader(name, value);
            }
        });

        if (contentType && contentType.includes('text/html')) {
            const contentBuffer = await response.arrayBuffer();
            let content = Buffer.from(contentBuffer).toString();
            content = rewriteHtmlContent(content, targetUrl);
            res.end(content);
        } else {
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
