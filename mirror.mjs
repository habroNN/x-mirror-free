// X aynalama botu (tarayıcı sürümü): kaynak hesabın profilini gerçek bir tarayıcıyla açar,
// yeni gönderileri okur ve senin hesabında aynısını paylaşır. API ve ücret gerektirmez.
//
// İlk çalıştırmada geçmiş gönderiler paylaşılmaz, sadece başlangıç noktası kaydedilir.

import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPost, findUserId, newTweets } from './x.mjs';

const SOURCE = (process.env.SOURCE_USERNAME ?? '').trim().replace(/^@/, '');
const DRY_RUN = process.env.DRY_RUN?.trim() === '1';
const STATE_FILE = new URL('./state.json', import.meta.url);
const AUTH_FILE = new URL('./auth.json', import.meta.url);
const DEBUG_DIR = fileURLToPath(new URL('./debug/', import.meta.url));
const MAP_LIMIT = 500;

// Bu gönderiye özel kalıcı sorun: atlanır, sıradakine geçilir.
// Diğer tüm hatalar çalışmayı durdurur ve gönderi bir sonraki çalışmada tekrar denenir.
class Skip extends Error {}

function loadAuth() {
  if (process.env.X_AUTH) return JSON.parse(Buffer.from(process.env.X_AUTH.trim(), 'base64').toString('utf8'));
  if (fs.existsSync(AUTH_FILE)) return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  throw new Error('Oturum bilgisi yok. GitHub\'da X_AUTH secret\'ını ekle (bilgisayarında: npm run login).');
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (state.source_username?.toLowerCase() === SOURCE.toLowerCase()) return state;
    console.log(`Kaynak hesap değişti (${state.source_username} -> ${SOURCE}), baştan başlanıyor.`);
  }
  return { source_username: SOURCE, map: {} };
}

function saveState(state) {
  if (DRY_RUN) return;
  const ids = Object.keys(state.map);
  if (ids.length > MAP_LIMIT) {
    const keep = ids.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)).slice(-MAP_LIMIT);
    state.map = Object.fromEntries(keep.map(k => [k, state.map[k]]));
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function screenshot(page, name) {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    await page.screenshot({ path: path.join(DEBUG_DIR, `${name}.png`) });
  } catch {}
}

const isLoginPage = url => /\/(login|i\/flow\/login|logout)/.test(url);
const SESSION_HELP = 'X oturumu düşmüş. Bilgisayarında "npm run login" çalıştır ve GitHub\'daki X_AUTH secret\'ını yeni değerle güncelle.';

async function readTimeline(page) {
  const waitFor = pattern => page
    .waitForResponse(r => pattern.test(r.url()) && r.ok(), { timeout: 60_000 })
    .then(r => r.json())
    .catch(() => null);
  const user = waitFor(/\/UserByScreenName\?/);
  // X profil gönderilerini eskiden UserTweets ile, Kasım 2026'dan beri UserOriginalsTimeline ile yüklüyor
  const tweets = waitFor(/\/User(Tweets|OriginalsTimeline)\?/);
  // Hata olursa kayda yazmak için X'in arka planda yaptığı isteklerin adı ve durum kodu
  const seen = [];
  const onResponse = r => { if (r.url().includes('/graphql/')) seen.push(`${r.url().split('?')[0].split('/').pop()} ${r.status()}`); };
  page.on('response', onResponse);

  await page.goto(`https://x.com/${SOURCE}`, { waitUntil: 'domcontentloaded' });
  const [userJson, tweetsJson] = await Promise.all([user, tweets]);
  page.off('response', onResponse);

  if (isLoginPage(page.url())) throw new Error(SESSION_HELP);
  if (!tweetsJson) {
    await screenshot(page, 'profil');
    console.log(`Sayfa: ${page.url()}\nX istekleri: ${seen.join(', ') || 'hiç yok'}`);
    console.log(`Sayfadaki yazı: ${(await page.locator('body').innerText().catch(() => '')).slice(0, 500).replace(/\s+/g, ' ')}`);
    throw new Error(`@${SOURCE} profilindeki gönderiler yüklenemedi (debug/profil.png ekran görüntüsüne bak).`);
  }
  return { userJson, tweetsJson };
}

async function downloadMedia(media, tweetId) {
  const files = [];
  for (const [i, m] of media.entries()) {
    const res = await fetch(m.url);
    if (!res.ok) throw new Error(`Medya indirilemedi (${res.status}): ${m.url}`);
    const file = path.join(os.tmpdir(), `x-mirror-${tweetId}-${i}.${m.ext}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    files.push(file);
  }
  return files;
}

// Metni DraftJS editörüne "yapıştırarak" ekler. Tek tek yazmak, # ve @ önerilerini tetikleyip
// metni bozabiliyor. Yapıştırma çalışmazsa klavyeyle yazmaya geri döner.
async function insertText(page, editor, text) {
  await editor.click();
  await editor.evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
  await page.waitForTimeout(800);
  if (!(await editor.innerText()).trim()) await page.keyboard.type(text, { delay: 25 });
}

async function waitEnabled(button, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if ((await button.getAttribute('aria-disabled')) !== 'true') return;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Skip('"Post" butonu aktif olmadı: metin çok uzun (Premium gerekir) ya da medya yüklenemedi');
}

async function publish(page, post, tweetId) {
  const files = await downloadMedia(post.media, tweetId);

  // Normal gönderi açılan pencerede, yanıt ise gönderi sayfasının altındaki kutuda yazılır
  let scope;
  if (post.replyTo) {
    await page.goto(`https://x.com/i/web/status/${post.replyTo}`, { waitUntil: 'domcontentloaded' });
    scope = page.locator('main');
  } else {
    await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded' });
    scope = page.locator('[role="dialog"]');
  }
  if (isLoginPage(page.url())) throw new Error(SESSION_HELP);

  const editor = scope.locator('[data-testid="tweetTextarea_0"]').first();
  const button = scope.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]').first();
  await editor.waitFor({ timeout: 30_000 });

  if (post.text) await insertText(page, editor, post.text);
  if (files.length) await scope.locator('input[data-testid="fileInput"]').first().setInputFiles(files);
  await waitEnabled(button, 5 * 60_000);
  await page.waitForTimeout(1500);

  const created = page.waitForResponse(r => /\/Create(Note)?Tweet(\?|$)/.test(r.url()), { timeout: 90_000 });
  await button.click();
  const res = await created;
  const json = await res.json().catch(() => ({}));
  for (const f of files) fs.rmSync(f, { force: true });

  const result = json?.data?.create_tweet?.tweet_results?.result ?? json?.data?.notetweet_create?.tweet_results?.result;
  if (result?.rest_id) return result.rest_id;

  const error = json?.errors?.[0];
  const message = `${error?.code ?? res.status()}: ${error?.message ?? 'bilinmeyen hata'}`;
  if (error?.code === 187 || /duplicate/i.test(error?.message ?? '')) throw new Skip(`X aynı metni ikinci kez kabul etmedi (${message})`);
  throw new Error(`X gönderiyi kabul etmedi (${message})`);
}

async function main() {
  if (!SOURCE) throw new Error('SOURCE_USERNAME boş. GitHub\'da Settings > Secrets and variables > Actions > Variables bölümüne ekle.');

  const state = loadState();
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
  const context = await browser.newContext({ storageState: loadAuth(), viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  const page = await context.newPage();
  let current = null;

  try {
    const { userJson, tweetsJson } = await readTimeline(page);
    state.source_id ??= findUserId(userJson, tweetsJson, SOURCE);
    if (!state.source_id) throw new Error(`@${SOURCE} hesabı bulunamadı. Kullanıcı adını kontrol et.`);

    const tweets = newTweets(tweetsJson, state.source_id, state.last_id);

    if (!state.initialized && !DRY_RUN) {
      state.initialized = true;
      if (tweets.length) state.last_id = tweets.at(-1).rest_id;
      saveState(state);
      console.log(`İlk çalışma: @${SOURCE} için başlangıç noktası kaydedildi. Bundan sonraki gönderiler aynalanacak.`);
      return;
    }

    const queue = state.initialized ? tweets : tweets.slice(-5);
    console.log(`@${SOURCE}: ${queue.length} yeni gönderi${DRY_RUN ? ' (DENEME MODU, hiçbir şey paylaşılmayacak)' : ''}`);

    for (const t of queue) {
      current = t.rest_id;
      const post = buildPost(t, state.source_id, state.map);
      if (post.skip) {
        console.log(`  ${t.rest_id}: atlandı (${post.skip})`);
      } else if (DRY_RUN) {
        console.log(`  [DENEME] ${t.rest_id} -> ${JSON.stringify(post)}`);
        state.map[t.rest_id] = `deneme-${t.rest_id}`;
      } else {
        try {
          const newId = await publish(page, post, t.rest_id);
          state.map[t.rest_id] = newId;
          console.log(`  ${t.rest_id} -> paylaşıldı: https://x.com/i/web/status/${newId}`);
        } catch (e) {
          if (!(e instanceof Skip)) throw e;
          await screenshot(page, `atlandi-${t.rest_id}`);
          console.log(`::warning::${t.rest_id} atlandı: ${e.message}`);
        }
        await page.waitForTimeout(3000 + Math.random() * 4000);
      }
      state.last_id = t.rest_id;
      saveState(state);
    }
  } catch (e) {
    await screenshot(page, 'hata');
    const where = current ? `${current} paylaşılamadı, sonraki çalışmada tekrar denenecek: ` : '';
    console.error(`::error::${where}${e.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error(`::error::${e.message}`);
  process.exitCode = 1;
});
