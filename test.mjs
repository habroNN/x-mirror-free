// x.mjs'teki ayrıştırma mantığını örnek bir X yanıtıyla test eder: npm test

import assert from 'node:assert/strict';
import { buildPost, findUserId, newTweets } from './x.mjs';

const SRC = '42';
const user = { core: { screen_name: 'Kaynak' } };
const tweet = (id, legacy, extra = {}) => ({
  __typename: 'Tweet', rest_id: id, core: { user_results: { result: user } },
  legacy: { user_id_str: SRC, full_text: '', ...legacy }, ...extra,
});

const timeline = {
  data: { user: { result: { timeline: { timeline: { instructions: [
    { type: 'TimelinePinEntry', entry: { content: { itemContent: { tweet_results: { result: tweet('90', { full_text: 'sabit eski gönderi' }) } } } } },
    { type: 'TimelineAddEntries', entries: [
      { content: { itemContent: { tweet_results: { result: tweet('101', {
        full_text: 'Merhaba https://t.co/aaa bak &amp; gör https://t.co/med',
        display_text_range: [0, 38],
        entities: { urls: [{ url: 'https://t.co/aaa', expanded_url: 'https://ornek.com' }], media: [{ url: 'https://t.co/med' }] },
        extended_entities: { media: [
          { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/A.jpg' },
          { type: 'video', video_info: { variants: [
            { content_type: 'application/x-mpegURL', url: 'https://v/x.m3u8' },
            { content_type: 'video/mp4', bitrate: 832000, url: 'https://v/low.mp4' },
            { content_type: 'video/mp4', bitrate: 2176000, url: 'https://v/high.mp4' },
          ] } },
        ] },
      }) } } } },
      // kendi gönderisine devam (thread), görünürlük sarmalayıcısıyla
      { content: { items: [{ item: { itemContent: { tweet_results: { result: { __typename: 'TweetWithVisibilityResults', tweet: tweet('102', {
        full_text: '@Kaynak devamı burada', display_text_range: [8, 21],
        in_reply_to_status_id_str: '101', in_reply_to_user_id_str: SRC,
      }) } } } } }] } },
      { content: { itemContent: { tweet_results: { result: tweet('103', {
        full_text: '@baskasi sana yanıt', display_text_range: [9, 19],
        in_reply_to_status_id_str: '555', in_reply_to_user_id_str: '7',
      }) } } } },
      { content: { itemContent: { tweet_results: { result: tweet('104', {
        full_text: 'Şuna bakın', is_quote_status: true, quoted_status_id_str: '777',
        quoted_status_permalink: { expanded: 'https://twitter.com/b/status/777' },
      }, { quoted_status_result: { result: { rest_id: '777', legacy: { user_id_str: '7', full_text: 'başkasının gönderisi' } } } }) } } } },
      { content: { itemContent: { tweet_results: { result: tweet('105', { full_text: 'RT @b: repost', retweeted_status_result: {} }) } } } },
      { content: { itemContent: { tweet_results: { result: tweet('106', { full_text: 'Hangisi?' }, { card: { legacy: { name: 'poll2choice_text_only' } } }) } } } },
      { content: { itemContent: { tweet_results: { result: tweet('107', { full_text: 'kısa' }, {
        note_tweet: { note_tweet_results: { result: { text: 'Çok uzun metin https://t.co/u1', entity_set: { urls: [{ url: 'https://t.co/u1', expanded_url: 'https://uzun.com' }] } } } },
      }) } } } },
    ] },
  ] } } } } },
};

assert.equal(findUserId(null, timeline, 'kaynak'), SRC);
assert.equal(findUserId({ data: { user: { result: { rest_id: '9' } } } }, timeline, 'kaynak'), '9');

const ids = newTweets(timeline, SRC, null).map(t => t.rest_id);
assert.deepEqual(ids, ['90', '101', '102', '103', '104', '106', '107'], 'repost ve başkasının gönderisi hariç, sıralı');
assert.deepEqual(newTweets(timeline, SRC, '101').map(t => t.rest_id), ['102', '103', '104', '106', '107']);

const byId = Object.fromEntries(newTweets(timeline, SRC, null).map(t => [t.rest_id, t]));
const mirrored = { 101: 'm101' };

assert.deepEqual(buildPost(byId[101], SRC, mirrored), {
  text: 'Merhaba https://ornek.com bak & gör',
  media: [{ url: 'https://pbs.twimg.com/media/A.jpg?name=orig', ext: 'jpg' }, { url: 'https://v/high.mp4', ext: 'mp4' }],
  replyTo: null,
});
assert.deepEqual(buildPost(byId[102], SRC, mirrored), { text: 'devamı burada', media: [], replyTo: 'm101' });
assert.ok(buildPost(byId[102], SRC, {}).skip, 'aynalanmamış gönderinin devamı atlanır');
assert.ok(buildPost(byId[103], SRC, mirrored).skip, 'başkasına yanıt atlanır');
assert.equal(buildPost(byId[104], SRC, mirrored).text, 'Şuna bakın\nhttps://twitter.com/b/status/777');
assert.ok(buildPost(byId[106], SRC, mirrored).skip, 'anket atlanır');
assert.equal(buildPost(byId[107], SRC, mirrored).text, 'Çok uzun metin https://uzun.com');

console.log('✔ Tüm testler geçti');
