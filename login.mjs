// Bilgisayarında bir kez çalıştırılır. X, programla açılan tarayıcılarda girişi engellediği için
// girişi kendi normal tarayıcında yaparsın; buraya oradaki oturumun iki çerezini yapıştırırsın.
// Betik bunlardan oturum bilgisini oluşturur ve GitHub'a yapıştırman için panoya kopyalar.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline/promises';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(`
Normal tarayıcında (Edge/Chrome) x.com'a kendi hesabınla giriş yapmış olman gerekiyor.
Orada F12 > "Application" (Uygulama) > Cookies > https://x.com bölümünü aç.
`);

const lines = rl[Symbol.asyncIterator]();
const ask = async name => {
  process.stdout.write(`${name} değerini yapıştır ve Enter'a bas: `);
  const value = ((await lines.next()).value ?? '').trim().replace(/^"|"$/g, '');
  if (!/^[0-9a-f]{20,}$/i.test(value)) {
    console.error(`\nBu bir ${name} değerine benzemiyor. "Value" (Değer) sütunundaki yazının tamamını kopyaladığından emin ol.`);
    process.exit(1);
  }
  return value;
};

const authToken = await ask('auth_token');
const ct0 = await ask('ct0');
rl.close();

const expires = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
const cookie = (name, value, httpOnly) => ({
  name, value, domain: '.x.com', path: '/', expires, httpOnly, secure: true, sameSite: 'None',
});
const auth = { cookies: [cookie('auth_token', authToken, true), cookie('ct0', ct0, false)], origins: [] };

const base64 = Buffer.from(JSON.stringify(auth)).toString('base64');
fs.writeFileSync(new URL('./auth.json', import.meta.url), JSON.stringify(auth, null, 2));
fs.writeFileSync(new URL('./auth-base64.txt', import.meta.url), base64);

try {
  execSync('clip', { input: base64 });
  console.log('\n✔ Tamam. X_AUTH değeri PANOYA KOPYALANDI. GitHub\'da secret olarak yapıştır (Ctrl+V).');
} catch {
  console.log('\n✔ Tamam. auth-base64.txt dosyasını Not Defteri ile aç, içeriğini kopyala ve GitHub\'a X_AUTH olarak yapıştır.');
}
console.log('⚠ auth.json ve auth-base64.txt hesabının anahtarıdır, kimseyle paylaşma.');
console.log('⚠ Normal tarayıcında x.com\'dan ÇIKIŞ YAPMA, yoksa bu anahtar geçersiz olur (tarayıcıyı kapatmak sorun değil).');
