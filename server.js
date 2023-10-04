const path = require('path');
const fastify = require('fastify')({
  logger: true
});
const translate = require('google-translate-extended-api');
const fs = require('fs');
const db = require('./src/dbqueries');

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';
const PUBLIC_FOLDER = 'public';
const TEMPLATE_FOLDER = 'templates';
const INDEX_PAGE = 'index.html';
const WORDS_PER_PAGE = 5;

const STATE = {
  translatedWord: {word: '',},
  wordCount: 0,
  allMisses: 0,
  watchIndex: 0,
  randomIndex: 1,
};

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, PUBLIC_FOLDER),
  prefix: '/public/',
})

fastify.register(require("@fastify/view"), {
  root: path.join(__dirname, TEMPLATE_FOLDER),
  engine: {
    ejs: require('ejs')
  }
});

fastify.get('/', async (req, reply) => {
  return reply.sendFile(INDEX_PAGE);
});

fastify.get('/translate', async (req, reply) => {
  if (req.query.word == '')
    return reply.type('text/html').send('');

  try {
    STATE.translatedWord = await db.getTranslation(req.query.word);

    if (STATE.translatedWord.word != '')
      return reply.view('word.ejs', {json: [STATE.translatedWord],
        shorten: 0, buttons: 0, gameButtons: 0, offset: 0});
  } catch (err) {
    console.error(err);
  }

  try {
    STATE.translatedWord = await translate(req.query.word, 'en', 'ru');
    return reply.view('word.ejs', {json: [STATE.translatedWord],
      shorten: 0, buttons: 0, gameButtons: 0, offset: 0});
  } catch (err) {
    console.error(err);
  }

  return reply.type('text/html').send('');
});

fastify.get('/save', async (req, reply) => {
  if (STATE.translatedWord.word == '')
    return reply.type('text/html').send('Empty');
  
  try {
    STATE.wordCount = await db.insertAndGetCount(
      STATE.translatedWord.word, STATE.translatedWord);

    return reply.type('text/html').send('Saved!');
  } catch (err) {
    console.error(err);
  }
  return reply.type('text/html').send('Save failed!');
});

fastify.get('/render_vault', async (req, reply) => {
  if (req.query.reset)
    STATE.watchIndex = 0;

  try {
    let idx = STATE.wordCount - STATE.watchIndex - WORDS_PER_PAGE;
    let len = WORDS_PER_PAGE;
    if (idx < 0) {
      len += idx;
      idx = 0;
    }
	
    return reply.view('word.ejs', {json: (await db.getRows(len, idx))
      .map(JSON.parse).reverse(), shorten: 0, buttons: 1, gameButtons: 0, offset: 0});
  } catch (err) {
    console.error(err);
    return reply.type('text/html').send('No entries');
  }
});

fastify.get('/get_word_count', async (req, reply) => {
  return reply.type('text/html').send("Total: " + STATE.wordCount.toString());
});

fastify.get('/get_pages', async (req, reply) => {
  let watchIndex = STATE.watchIndex;
  if (req.query.reset)
    watchIndex = 0;

  const maxPages = Math.ceil(STATE.wordCount / WORDS_PER_PAGE);
  const currPage = Math.floor(watchIndex / WORDS_PER_PAGE) + (maxPages ? 1 : 0);
  return reply.type('text/html').send(`Page ${currPage} of ${maxPages}`);
});

fastify.get('/next_words', async (req, reply) => {
  if (STATE.watchIndex + WORDS_PER_PAGE < STATE.wordCount)
    STATE.watchIndex += WORDS_PER_PAGE;

  return reply.sendFile('pages.html');
});

fastify.get('/prev_words', async (req, reply) => {
  STATE.watchIndex = Math.max(STATE.watchIndex - WORDS_PER_PAGE, 0);
  return reply.sendFile('pages.html');
});

fastify.get('/full_next_words', async (req, reply) => {
  STATE.watchIndex = Math.floor(STATE.wordCount / WORDS_PER_PAGE) * WORDS_PER_PAGE;
  if (STATE.watchIndex == STATE.wordCount && STATE.wordCount)
    STATE.watchIndex -= WORDS_PER_PAGE;

  return reply.sendFile('pages.html');
});

fastify.get('/full_prev_words', async (req, reply) => {
  STATE.watchIndex = 0;
  return reply.sendFile('pages.html');
});

fastify.get('/short', async (req, reply) => {
  let translation;
  try {
    translation = await db.getTranslation(req.query.word);
  } catch (err) {
    let translation = STATE.translatedWord;
  }

  const inv = !req.query.i;
  return reply.view('word.ejs', {json: [translation],
    shorten: inv, buttons: 1, gameButtons: 0, offset: req.query.n});
});

fastify.get('/random_word', async (req, reply) => {
  if (!STATE.wordCount)
    return reply.sendFile('game_empty.html');

  const randNum = Math.floor(Math.random() * (STATE.wordCount + STATE.allMisses));
  let translation;
  try {
    const ret = await db.getRandomWord(randNum);

    translation = JSON.parse(ret.translation);
    STATE.randomIndex = ret.index;
  } catch (err) {
    return reply.code(404).send('db failure');
  }

  return reply.view('game_start.ejs', {word: translation.word});
});

fastify.get('/show_word', async (req, reply) => {
  let translation;
  try {
    translation = await db.getNTranslation(STATE.randomIndex);
  } catch (err) {
    return reply.code(404).send('db failure');
  }

  return reply.view('word.ejs', {json: [translation],
    shorten: 0, buttons: 0, gameButtons: 1, offset: 0});
});

fastify.get('/show_result', async (req, reply) => {
  if (!req.query.g) STATE.allMisses++;

  let results;
  try {
    results = await db.getResults(STATE.randomIndex, req.query.g);
  } catch (err) {
    return reply.code(404).send('db failure');
  }

  return reply.view('game_results.ejs', {guesses: results.guesses, misses: results.misses});
});

const start = async () => {
  try {
    STATE.wordCount = await db.init();
    STATE.allMisses = await db.getAllMisses()

    let portNumber = parseInt(process.argv[2]);
    if (isNaN(portNumber) || portNumber < 0 || portNumber >= 65536)
        portNumber = DEFAULT_PORT;

    let hostString = process.argv[3];
    if (!/^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/.test(hostString))
	hostString = DEFAULT_HOST;

    await fastify.listen({ port: portNumber, host: hostString });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
