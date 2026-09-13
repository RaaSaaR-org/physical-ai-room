// A strict static host under a repository prefix, like GitHub Pages.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
const root = path.resolve('dist')
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const prefix = '/physical-ai-room/'
    if (!url.pathname.startsWith(prefix)) {
      res.writeHead(404)
      res.end()
      return
    }
    const file = path.resolve(
      root,
      decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html',
    )
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403)
      res.end()
      return
    }
    try {
      const data = await readFile(file)
      const type = mime[path.extname(file)] || 'text/plain'
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
      if (range) {
        const start = Number(range[1]),
          end = Math.min(data.length - 1, range[2] ? Number(range[2]) : data.length - 1)
        if (start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${data.length}` })
          res.end()
          return
        }
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': `bytes ${start}-${end}/${data.length}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
        })
        res.end(data.subarray(start, end + 1))
      } else {
        res.writeHead(200, {
          'Content-Type': type,
          'Content-Length': data.length,
          'Accept-Ranges': 'bytes',
        })
        res.end(data)
      }
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  .listen(4178, '127.0.0.1', () =>
    console.log('Pages test host: http://127.0.0.1:4178/physical-ai-room/'),
  )
