# X Aynalama Botu (Ücretsiz / Tarayıcı Sürümü) — Kurulum Rehberi

Bu bot, izin aldığın bir X hesabı (**kaynak hesap**) yeni bir gönderi paylaştığında aynısını senin hesabında paylaşır.

- X API kullanmaz, **hiçbir ücret ödemezsin**.
- GitHub'ın ücretsiz sunucularında gerçek bir tarayıcı açar.
- Her ~10 dakikada bir kaynak hesabın profiline bakar. Yeni gönderi varsa senin hesabında, bir insanın yapacağı gibi paylaşır.
- Bilgisayarın kapalı olsa da çalışır.

## ⚠️ Başlamadan önce bil

- Bu yöntem **X'in kurallarına aykırı**: X, API dışı otomasyonu yasaklıyor. X bunu fark ederse **senin hesabın** kilitlenebilir, doğrulama isteyebilir ya da kapatılabilir.
- X sitesini değiştirdikçe bot bozulabilir. O zaman kodun güncellenmesi gerekir.
- GitHub'ın sunucuları ABD'de. X sana "yeni bir konumdan giriş yapıldı" e-postası gönderebilir. Bu bottur, **"Bu ben değilim" deme**, yoksa oturum kapanır.

**Kopyaladıkları:**
- Metin
- Fotoğraf, video, GIF
- Alıntılar (link olarak eklenir, X alıntı kartı gösterir)
- Kaynak hesabın kendi gönderisine eklediği devam gönderileri (flood/thread)

**Kopyalamadıkları:**
- Repostlar
- Başkalarına verilen yanıtlar
- Anketler
- Bot kurulmadan önceki eski gönderiler

---

## Adım 1 — Oturum anahtarını al

Bu adım, botun senin hesabınla paylaşım yapabilmesi için gereken **oturum bilgisini** oluşturur. X, programla açılan tarayıcılarda girişi engelliyor. Bu yüzden girişi **kendi normal tarayıcında** yapıp oradan iki değer kopyalayacaksın.

**A) Normal tarayıcında giriş yap**
1. Her zaman kullandığın Edge'i (ya da Chrome'u) aç ve https://x.com adresine git.
2. Gönderileri **paylaşacak olan kendi hesabınla** giriş yap. Google ile girmek de olur.

**B) İki değeri bul**
1. x.com açıkken klavyeden **F12**'ye bas. Sağda ya da altta geliştirici paneli açılır.
2. Panelin üstündeki sekmelerden **Application** sekmesine tıkla (Türkçe ise **Uygulama**). Görünmüyorsa sekmelerin yanındaki **»** ya da **+** işaretine tıklayıp oradan seç.
3. Soldaki listede **Cookies** (Tanımlama bilgileri) bölümünü aç ve **https://x.com** satırına tıkla.
4. Ortadaki tabloda **Name** sütununda **`auth_token`** satırını bul. O satırın **Value** sütunundaki yazıya çift tıkla ve **Ctrl+C** ile kopyala.

**C) Değerleri betiğe ver**
1. `x-mirror-free` klasöründe boş bir yere sağ tıkla ve **Terminalde aç** seç. İlk sefer `npm install` yaz ve Enter'a bas.
2. Şunu yaz ve Enter'a bas:
   ```
   npm run login
   ```
3. `auth_token` sorulunca kopyaladığın değeri yapıştır (sağ tık ya da Ctrl+V) ve Enter'a bas.
4. Geliştirici paneline dön, aynı tabloda **`ct0`** satırının Value değerini kopyala. Terminale yapıştırıp Enter'a bas.
5. **"X_AUTH değeri PANOYA KOPYALANDI"** yazısını görünce bu adım tamam.

⚠️ Klasörde `auth.json` ve `auth-base64.txt` dosyaları oluşur. **Bunlar hesabının anahtarıdır, kimseyle paylaşma ve GitHub'a yükleme.**

⚠️ Normal tarayıcında x.com'dan **çıkış yapma**, yoksa anahtar geçersiz olur. Tarayıcıyı kapatmak sorun değil.

---

## Adım 2 — GitHub deposu oluştur

1. https://github.com adresinden ücretsiz hesap aç (varsa giriş yap).
2. Sağ üstten **+ → New repository**:
   - **Repository name:** `x-mirror-free`
   - **Public** seç. Bot her 10 dakikada bir çalıştığı için private depoların ücretsiz dakika sınırını aşar. Public'te sınır yok. Secret olarak eklediğin oturum bilgisini kimse göremez.
   - **Create repository**.
3. **uploading an existing file** linkine tıkla ve **sadece** şunları sürükle bırak:
   - `package.json`
   - `package-lock.json`
   - `mirror.mjs`
   - `x.mjs`
   - `login.mjs`
   - `test.mjs`
   - `README.md`
   - `.gitignore`
   - `.github` klasörü

   ❌ **`auth.json`, `auth-base64.txt` ve `node_modules` klasörünü YÜKLEME.**
4. **Commit changes**.

> **`.github` klasörü yüklenmezse:** **Add file → Create new file** seç, dosya adına `.github/workflows/mirror.yml` yaz, bilgisayarındaki `mirror.yml` dosyasının içeriğini yapıştır ve **Commit changes** de.

---

## Adım 3 — Oturum bilgisini ve kaynak hesabı ekle

Depoda **Settings → Secrets and variables → Actions** menüsüne gir.

**Secrets** sekmesinde **New repository secret**:

| Name | Value |
|---|---|
| `X_AUTH` | Adım 1'de panoya kopyalanan değer (Ctrl+V). Panoda kalmadıysa `auth-base64.txt` dosyasını Not Defteri ile açıp içeriğini kopyala. |

**Variables** sekmesinde **New repository variable**:

| Name | Value |
|---|---|
| `SOURCE_USERNAME` | Kaynak hesabın kullanıcı adı, `@` olmadan |
| `DRY_RUN` | `1` (deneme modu) |

---

## Adım 4 — Deneme (hiçbir şey paylaşılmaz)

1. **Actions** sekmesine gir. Workflow'ları etkinleştirmeni isteyen bir uyarı çıkarsa onayla.
2. Soldan **X Mirror → Run workflow → Run workflow**.
3. 2–3 dakika sonra çalışmaya tıkla ve **Gönderileri aynala** adımını aç. Kaynak hesabın son 5 gönderisi `[DENEME]` satırları olarak görünmeli.

## Adım 5 — Gerçek moda geç

1. **Variables** bölümünden `DRY_RUN` değişkenini **sil**.
2. **Run workflow** ile bir kez elle çalıştır. Bu ilk çalışma bir şey paylaşmaz, sadece başlangıç noktasını kaydeder. Depoda `state.json` dosyası oluşur.
3. Bitti 🎉 Kaynak hesabın bundan sonraki gönderileri ~10 dakika içinde senin hesabında da paylaşılır.

**İlk gerçek gönderiyi mutlaka kontrol et:** X'te açıp metin, fotoğraf ve videonun doğru geldiğine bak.

---

## Günlük kullanım

- **Durdurmak:** Actions → X Mirror → sağ üstteki **⋯** menüsü → **Disable workflow**
- **Kaynak hesabı değiştirmek:** `SOURCE_USERNAME` değişkenini güncelle.
- **Ne paylaşıldı:** Actions sekmesindeki çalışmaların kayıtlarına bak. Her paylaşımın linki orada yazar.
- **Hata olursa:** çalışmanın sayfasının en altında **Artifacts → ekran-goruntuleri** var. Botun hata anında gördüğü ekranı oradan indirip bakabilirsin. Bu görüntüler 3 gün sonra silinir. Public depolarda GitHub hesabı olan herkes indirebilir.

## Sorun giderme

| Kayıtta görülen | Çözüm |
|---|---|
| `X oturumu düşmüş` | Adım 1'i (B ve C kısımlarını) tekrarla, sonra `X_AUTH` secret'ını yeni değerle güncelle (secret'a tıkla → **Update**). |
| `profilindeki gönderiler yüklenemedi` | Kullanıcı adı yanlış olabilir ya da X doğrulama istiyordur. Ekran görüntüsüne bak. Doğrulama isteniyorsa normal tarayıcında x.com'a girip onayla, sonra Adım 1'i tekrarla. |
| `Timeout ... tweetTextarea` veya `tweetButton` | X sitesinin yapısı değişmiş. Kodun güncellenmesi gerekir. |
| `"Post" butonu aktif olmadı` | Metin 280 karakterden uzun (hesabında Premium yoksa paylaşılamaz) ya da video çok büyük. Gönderi atlanır. |
| `İlerlemeyi kaydet` adımında `push` hatası | **Settings → Actions → General → Workflow permissions** altında **Read and write permissions** seç. |
| Bot 60 gün sonra durdu | Depoda 60 gün değişiklik olmazsa GitHub zamanlanmış görevleri durdurur. **Enable workflow** ile tekrar aç. |

## Bilgisayarında denemek (isteğe bağlı)

Botun ne yaptığını kendi gözünle görmek istersen komut penceresinde şunları çalıştır:

```
npx playwright install chromium
set SOURCE_USERNAME=kaynakhesap
set DRY_RUN=1
set HEADLESS=0
npm start
```

Tarayıcı açılır ve botun yaptıklarını izleyebilirsin. `DRY_RUN=1` olduğu için hiçbir şey paylaşılmaz.
