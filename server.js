const express = require('express');
const cors = require('cors');
const path = require('path');
const { URL } = require('url');

const app = express();
const PORT = 3000;

app.use(cors()); 

app.use(express.static(__dirname));

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

        response.headers.forEach((value, name) => {
            if (!['connection', 'content-encoding', 'transfer-encoding', 'content-length'].includes(name.toLowerCase())) {
                res.setHeader(name, value);
            }
        });

        const buffer = await response.arrayBuffer();
        res.end(Buffer.from(buffer));

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
