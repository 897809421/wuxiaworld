
let request = require('request')
let cheerio = require('cheerio')
let fs = require('fs')
let http = require('http')

const base = 'https://www.wuxiaworld.com'

function log() {
  console.log.apply(this, arguments)
}

function debug() {
  console.log.apply(this, arguments)
}

function Novel(name, path) {

  this.name = name
  this.url = base + path

  this.imgUrl = ''
  this.author = ''
  this.translator = ''
  this.synopsis = ''

  this.chapters = []
}

function Chapter(page) {
  this.title = ''
  this.url = ''
  this.content = ''
}

function chaptersFromNovel(rawChapters) {
  let chapters = []
  for (let i = 0; i < rawChapters.length; i++) {
    let c = rawChapters.eq(i)

    let chapter = {}

    chapter.src = c.attr('href')
    chapter.name = c.text()

    chapters.push(chapter)
  }

  return chapters
}

function novelFromHtml(html) {
  let novel = new Novel()
  let options = {
    decodeEntities: false,
  }
  const e = cheerio.load(html, options)

  novel.name = e('.novel-body > h2').text()
  novel.imgUrl = e('.img-thumbnail').attr('src')
  novel.translator = e('.novel-body > dd').eq(0).text()
  novel.author = e('.novel-body > dd').eq(1).text()
  novel.synopsis = e('.fr-view > p').text()
  novel.chapters = chaptersFromNovel(e('.chapter-item > a'))

  return novel
}

function dataFromUrl(url, callback) {
  request(url, (error, response, body) => {
    if (error === null && response.statusCode == 200) {
      callback(body)
    } else {
      console.log(`${url} body获取失败`)
    }
  })
}

// 将主页缓存到本地目录
function cacheNovelHome(filePath, url, data, callback) {
  dataFromUrl(url, (data) => {
    fs.writeFile(filePath, data, (err) => {
      if (err) {
        console.log('***读取小说主页失败 ***ERROR：', err)
      } else {
        let e = cheerio.load(data)
        let html = e.html()
        console.log('---写入小说主页成功')

        callback(html)
      }
    })
  })
}

// 根据小说主页数据，获取小说数据并缓存本地
function chacheNovelInfo(html) {
  let novel = novelFromHtml(html)

  let name = novel.name
  let path = `./${name}/${name}.txt`

  novel = JSON.stringify(novel, null, 3)

  fs.writeFileSync(path, novel)
}

function getNovelInfo(novelName, callback) {
  let name = novelName
  let path = `./${name}/${name}.txt`
  let data = fs.readFileSync(path, 'utf-8')
  novel = JSON.parse(data)
  return novel
}

function createNovelDir(name) {
  let path = `./${name}`
  fs.mkdirSync(path)

  path = `${path}/Chapters`
  fs.mkdirSync(path)
}

// 爬取小说主页，并将小说页面缓存
function loadNovel(novel) {
  let url = novel.url
  let filePath = `./${novel.name}/index.html`

  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      // 没缓存，爬取小说主页，缓存在本地上
      console.log('--> func loadNoovel')
      if (err) {
        console.log('--首次下载，初始化中.....')
        createNovelDir(novel.name)
        cacheNovelHome(filePath, url, data, (html) => {
          // 根据小说主页数据，获取小说数据并缓存本地
          chacheNovelInfo(html)
          resolve(getNovelInfo(novel.name))
        })
      } else {
        console.log('---已缓存该小说主页')

      }
    })
  })
}

function downloadNovel(novel) {
  let novelName = novel.name

  loadNovel(novel, () => {
    let novel = getNovelInfo(novelName)
    let chapters = novel.chapters

    let isCaChe = []
    for (let i = 0; i < chapters.length; i++) {
      isCaChe.push(false)
    }
    console.log('----------------------------')

    // 每隔一段时间重新爬取小说网站，直到所有章节全部缓存
    let timer = setInterval(() => {
      let done = true

      // 判断所有章节是否被下载
      for (let i = 0; i < chapters.length; i++) {
        if (isCaChe[i] === false) {
          done = false
        }
      }

      if (done) {
        clearInterval(timer)
        console.log('---全部缓存完毕')
      }

      for (let i = 0; i < chapters.length; i++) {
        let url = `./${novel.name}/Chapters/第${i + 1}章.html`

        fs.readFile(url, (err, data) => {
          // 没有此章，从网上爬取
          if (err) {
            cacheChapter(novel, i + 1)
          }
          // 已缓存，将此章标记为已下载
          else {
            isCaChe[i] = true
          }
        })
      }

    }, 6000)

  })
}

function test() {
  // 整合成全本
  // let content = ''
  //
  // for (var i = 0; i < 1648; i++) {
  //     let page = i+1
  //     let data = fs.readFileSync(`./${name}/Chapters/第${page}章.html`)
  //
  //     let e = cheerio.load(data)
  //     let ps = e('p')
  //
  //     ps.each((i) => {
  //         content += ps.eq(i).text() + `\n`
  //     })
  //
  //     content += `\n\n\n`
  //
  // }
  //
  // fs.writeFile(`./${name}/斗破苍穹（英文版）.txt`, content, 'utf-8', ()=>{})
}

// ===============================================================
async function downloadNovel(novel) {
  // let length = novel.chapters.length
  let max = 666
  let start = 1
  // 分批数
  let n = 10
  let end = n
  let rest = max
  // 对庞大的请求做出分批处理
  while (true) {
    await asyncDownloadChapters(novel, start, end)
    start = start + n
    end += n
    rest -= n
    if (rest < n) {
      if (rest > 0) {
        await asyncDownloadChapters(novel, start, max)
      }
      break
    }
    log('搞定10')
  }
  console.log('全部下载完毕！')
}

// 下载多个章节
async function asyncDownloadChapters(novel, start, end) {

  const list = array(start, end)
  // 并发下载每个章节
  const resPromises = list.map(async l => {
    const response = await asyncDownloadChapter(novel, l)
    return response
  })

  // 按次序返回下载结果
  for (const resPromise of resPromises) {
    console.log(await resPromise)
  }
}

// 下载指定章节
async function asyncDownloadChapter(novel, page) {
  let chapter = getChapterInfo(novel, page)
  let result = ''

  chapter = await isChapterCache(chapter)

  if (chapter.isCache === false) {
    const r = await requestChapter(chapter.url)

    if (r.error === null && r.response.statusCode == 200) {
      chapter.data = dataToHtml(r)
      saveChapter(chapter.path, chapter.data)

      result = `---第 ${page} 章下载成功`
    } else {
      result = `***爬取第 ${page} 章网页失败，请检查网络是否有问题`
    }
  } else {
    result = `---第 ${page} 章已在本地缓存`
  }

  return result
}

async function asyncLoadNovel(novel) {
  const n = await loadNovel(novel)
  const c = await cacheChapter(n, 1)
  log(c)
  log('done')
}

function getChapterInfo(novel, page) {
  let i = page - 1
  let chapter = novel.chapters[i]

  let name = chapter.name.split(`\n`)[1].split(`:`)[1]
  let url = base + chapter.src
  let path = `./${novel.name}/Chapters/第${page}章.html`
  let c = {
    'name': name,
    'url': url,
    'path': path,
    'isCache': false,
    'data': '',
  }

  return c
}
// 下载小说的指定章节
// 1，判断该章节是否有缓存
function isChapterCache(chapter) {
  let c = chapter
  return new Promise((resolve, reject) => {
    fs.readFile(c.path, (err, data) => {
      // 已有缓存，则读取本地章节数据
      if (err === null) {
        c.isCache = true
        c.data = data
      }
      resolve(c)
    })
  })
}
// 2，没有缓存，根据该章节 url 爬取内容
function requestChapter(url) {
  debug('--> requestChapter')
  return new Promise((resolve, reject) => {
    request(url, (error, response, body) => {
      let res = {
        'error': error,
        'response': response,
        'body': body,
      }
      resolve(res)
    })
  })
}
// 3，对内容进行处理
function dataToHtml(res) {
  debug('--> dataToHtml')
  let options = {
    decodeEntities: false,
  }
  const e = cheerio.load(res.body, options)
  let content = e('#chapter-content')
  return content
}
// 4，缓存到本地
function saveChapter(path, content) {
  return new Promise((resolve) => {
    fs.writeFile(path, content, 'utf-8', (error) => {
      if (error) {
        log('***写入该章节失败 ERROR：', error)
      }
    })
  })
}

// 程序入口
async function __main() {
  debug = () => { }

  // 斗破苍穹英文版小说
  let name = 'Battle Through the Heavens'
  let path = '/novel/battle-through-the-heavens'

  // // 邪神英文版小说
  // let name = 'Against the Gods'
  // let path = '/novel/against-the-gods'

  let novel = new Novel(name, path)
  novel = await loadNovel(novel)

  // 下载小说指定章节
  // let result = await asyncDownloadChapter(novel, 10)
  // log(result)

  // 批量下载章节
  // asyncDownloadChapters(novel, 12, 21)
  
  // 下载整本小说
  downloadNovel(novel)
}

__main()


function array(start, end) {
  let length = end - start + 1
  return Array.from(Array(length), (v, k) => {
    return k + start
  })
}