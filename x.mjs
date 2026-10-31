// X web sitesinin arka planda kullandığı GraphQL yanıtlarından gönderileri çıkaran yardımcılar.
// Tarayıcıya bağlı değiller, bu yüzden test.mjs ile örnek verilerle test edilebilirler.

// Yanıtın yapısı sık değiştiği için belirli bir yola güvenmek yerine tüm JSON'u tarayıp
// gönderiye benzeyen her nesneyi topluyoruz (rest_id + legacy.full_text).
export function findTweets(node, out = []) {
  if (Array.isArray(node)) {
    for (const n of node) findTweets(n, out);
  } else if (node && typeof node === 'object') {
    if (node.rest_id && typeof node.legacy?.full_text === 'string') out.push(node);
    for (const v of Object.values(node)) findTweets(v, out);
  }
  return out;
}

export function findUserId(userJson, tweetsJson, username) {
  const id = userJson?.data?.user?.result?.rest_id;
  if (id) return id;
  const name = username.toLowerCase();
  for (const t of findTweets(tweetsJson)) {
    const u = t.core?.user_results?.result;
    const screenName = u?.core?.screen_name ?? u?.legacy?.screen_name;
    if (screenName?.toLowerCase() === name) return t.legacy.user_id_str;
  }
  return null;
}

const byId = (a, b) => (BigInt(a.rest_id) < BigInt(b.rest_id) ? -1 : BigInt(a.rest_id) > BigInt(b.rest_id) ? 1 : 0);

// Kaynak hesabın lastId'den sonraki kendi gönderileri, eskiden yeniye (repostlar hariç)
export function newTweets(tweetsJson, sourceId, lastId) {
  const unique = new Map(findTweets(tweetsJson).map(t => [t.rest_id, t]));
  return [...unique.values()]
    .filter(t => t.legacy.user_id_str === sourceId)
    .filter(t => !t.legacy.retweeted_status_result && !t.legacy.full_text.startsWith('RT @'))
    .filter(t => !lastId || BigInt(t.rest_id) > BigInt(lastId))
    .sort(byId);
}

function unescapeHtml(s) {
  return s.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
}

// Gönderiyi hedef hesapta paylaşılacak hale getirir: { text, media, replyTo } ya da { skip }
export function buildPost(t, sourceId, mirrored) {
  const L = t.legacy;

  let replyTo = null;
  if (L.in_reply_to_status_id_str) {
    replyTo = mirrored[L.in_reply_to_status_id_str];
    if (L.in_reply_to_user_id_str !== sourceId || !replyTo) {
      return { skip: 'başkasına yanıt ya da aynalanmamış bir gönderinin devamı' };
    }
  }

  if (t.card?.legacy?.name?.startsWith('poll')) {
    return { skip: 'anketler tarayıcıyla kopyalanamıyor' };
  }

  // 280 karakterden uzun gönderilerin tam metni note_tweet içinde gelir
  const note = t.note_tweet?.note_tweet_results?.result;
  let text, urls;
  if (note?.text) {
    text = note.text;
    urls = note.entity_set?.urls ?? [];
  } else {
    // display_text_range, yanıtların başındaki "@kullanıcı" kısmını ve sondaki medya linkini dışarıda bırakır
    const [start, end] = L.display_text_range ?? [0, Infinity];
    text = Array.from(L.full_text).slice(start, end).join('');
    urls = L.entities?.urls ?? [];
  }
  for (const m of L.entities?.media ?? []) text = text.replaceAll(m.url, '');
  for (const u of urls) text = text.replaceAll(u.url, u.expanded_url ?? u.url);
  text = unescapeHtml(text).trim();

  // Alıntının linki metinde yoksa ekle; X linki görünce alıntı olarak gösterir
  const quoted = L.is_quote_status && L.quoted_status_permalink?.expanded;
  if (quoted && !text.includes(`/status/${L.quoted_status_id_str}`)) {
    text = `${text}\n${quoted}`.trim();
  }

  const media = (L.extended_entities?.media ?? []).map(m => {
    if (m.type === 'photo') {
      return { url: `${m.media_url_https}?name=orig`, ext: m.media_url_https.split('.').pop() };
    }
    const best = (m.video_info?.variants ?? [])
      .filter(v => v.content_type === 'video/mp4')
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    return best && { url: best.url, ext: 'mp4' };
  }).filter(Boolean);

  if (!text && !media.length) return { skip: 'paylaşılacak içerik yok' };
  return { text, media, replyTo };
}
