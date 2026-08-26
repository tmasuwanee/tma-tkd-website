import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const assets = path.join(root, "client", "public", "flyer-assets");
const output = path.join(root, "client", "public", "flyer.html");

const dataUri = async (filename) => {
  const data = await readFile(path.join(assets, filename));
  return `data:image/png;base64,${data.toString("base64")}`;
};

const [hero, qr] = await Promise.all([dataUri("hero.png"), dataUri("trial-qr-navy.png")]);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Top Martial Arts | Free Trial Class</title>
  <style>
    @page { size: Letter portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 8.5in; min-height: 11in; margin: 0; }
    body { background: #e6e8ed; color: #14224b; font-family: Arial, Helvetica, sans-serif; }
    .flyer { position: relative; width: 8.5in; height: 11in; overflow: hidden; background: #f8f7f3; }
    .hero { position: relative; height: 3.1in; overflow: hidden; background: #07101f; }
    .hero-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 48%; }
    .hero-copy { position: relative; z-index: 1; width: 5.1in; padding: 0.38in 0 0 0.52in; color: #fff; }
    .brand { display: flex; align-items: center; gap: 0.12in; margin-bottom: 0.22in; font-weight: 800; font-size: 10pt; letter-spacing: 0.13em; text-transform: uppercase; }
    .brand-mark { width: 0.25in; height: 0.25in; border: 2px solid #d6a544; display: grid; place-items: center; color: #d6a544; font-family: Georgia, serif; font-size: 10pt; line-height: 1; }
    .eyebrow { margin: 0 0 0.1in; color: #e5bd66; font-size: 9pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
    h1 { max-width: 4.8in; margin: 0; font-family: Arial Black, Arial, Helvetica, sans-serif; font-size: 31pt; line-height: 0.98; letter-spacing: -0.055em; }
    .hero-copy p { max-width: 3.65in; margin: 0.16in 0 0; color: #eef1f8; font-size: 11pt; line-height: 1.34; }
    .gold-rule { width: 0.8in; height: 0.035in; margin-top: 0.22in; background: #d6a544; }
    .content { position: relative; z-index: 2; margin-top: -0.31in; padding: 0 0.52in; }
    .scan-card { width: 4.08in; margin: 0 auto; padding: 0.24in 0.3in 0.2in; border: 1px solid #d4d8e1; border-radius: 0.13in; background: #fff; text-align: center; box-shadow: 0 0.11in 0.24in rgba(20, 34, 75, 0.16); }
    .scan-kicker { margin: 0 0 0.1in; color: #14224b; font-size: 11.5pt; font-weight: 800; letter-spacing: 0.012em; }
    .qr-wrap { display: inline-flex; align-items: center; justify-content: center; width: 2.84in; height: 2.84in; padding: 0.06in; border: 1px solid #e2e5eb; background: #fff; }
    .qr-wrap img { display: block; width: 2.7in; height: 2.7in; image-rendering: pixelated; }
    .url { margin: 0.11in 0 0; color: #33436a; font-family: "Courier New", Courier, monospace; font-size: 9.2pt; font-weight: 700; letter-spacing: 0.025em; }
    .simple { margin: 0.19in auto 0; text-align: center; }
    .simple h2, .programs h2 { margin: 0; color: #14224b; font-size: 11pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
    .steps { display: flex; justify-content: center; gap: 0.18in; margin-top: 0.14in; }
    .step { width: 1.63in; padding-right: 0.12in; border-right: 1px solid #cdd3df; text-align: left; }
    .step:last-child { padding-right: 0; border-right: 0; }
    .step-num { display: block; margin-bottom: 0.035in; color: #c78d23; font-family: Georgia, serif; font-size: 16pt; font-weight: 700; line-height: 1; }
    .step p { margin: 0; color: #35425e; font-size: 8.35pt; font-weight: 700; line-height: 1.2; }
    .programs { margin-top: 0.19in; padding-top: 0.18in; border-top: 1px solid #d5d8de; text-align: center; }
    .program-list { display: grid; grid-template-columns: 1fr 1fr; gap: 0.075in 0.1in; max-width: 5.4in; margin: 0.12in auto 0; }
    .program { padding: 0.08in 0.1in; border: 1px solid #d6dae3; background: #fff; color: #1a2d5a; font-size: 9.2pt; font-weight: 800; }
    .program small { color: #677189; font-size: 7.7pt; font-weight: 700; }
    .footer { position: absolute; right: 0; bottom: 0; left: 0; min-height: 1.03in; padding: 0.2in 0.52in 0.18in; background: #14224b; color: #fff; }
    .footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 0.22in; }
    .location { font-size: 10pt; font-weight: 700; line-height: 1.26; }
    .location span { display: block; color: #cdd5e7; font-size: 8.4pt; font-weight: 600; }
    .phone { flex: 0 0 auto; padding-left: 0.22in; border-left: 1px solid rgba(214, 165, 68, 0.72); color: #f2c866; font-size: 13.5pt; font-weight: 800; letter-spacing: 0.02em; }
    .footer-note { margin-top: 0.105in; color: #aeb9d0; font-size: 7.1pt; letter-spacing: 0.06em; text-transform: uppercase; }
    @media print {
      html, body { width: 8.5in !important; height: 11in !important; min-height: 11in !important; background: #fff !important; }
      .flyer { width: 8.5in !important; height: 11in !important; box-shadow: none !important; }
    }
  </style>
</head>
<body>
  <main class="flyer" aria-label="Top Martial Arts free trial class flyer">
    <header class="hero">
      <img class="hero-image" src="${hero}" alt="Martial artist performing a high kick">
      <div class="hero-copy">
        <div class="brand"><span class="brand-mark">T</span><span>Top Martial Arts</span></div>
        <p class="eyebrow">Suwanee, Georgia</p>
        <h1>Your First Class Is On Us.</h1>
        <p>See the school, meet the team, and find a class that fits your family.</p>
        <div class="gold-rule"></div>
      </div>
    </header>

    <section class="content">
      <section class="scan-card" aria-label="Free trial sign up QR code">
        <p class="scan-kicker">Scan to claim your free class</p>
        <div class="qr-wrap"><img src="${qr}" alt="QR code for tmatkd.com/trial"></div>
        <p class="url">tmatkd.com/trial</p>
      </section>

      <section class="simple" aria-label="How it works">
        <h2>Simple from here</h2>
        <div class="steps">
          <div class="step"><span class="step-num">1</span><p>Scan the code</p></div>
          <div class="step"><span class="step-num">2</span><p>Pick your class time</p></div>
          <div class="step"><span class="step-num">3</span><p>Sign in, two minutes</p></div>
          <div class="step"><span class="step-num">4</span><p>Show up and train</p></div>
        </div>
      </section>

      <section class="programs" aria-label="Programs">
        <h2>Programs for every starting point</h2>
        <div class="program-list">
          <div class="program">Taekwondo</div>
          <div class="program">Brazilian Jiu Jitsu</div>
          <div class="program">Kickboxing</div>
          <div class="program">Little Tigers <small>ages 4 to 5</small></div>
        </div>
      </section>
    </section>

    <footer class="footer">
      <div class="footer-inner">
        <div class="location">Top Martial Arts Suwanee<span>2005 Lawrenceville Suwanee Rd, Suwanee, GA 30024</span></div>
        <div class="phone">(770) 277-3009</div>
      </div>
      <div class="footer-note">Bring a friend, come as you are, and train with us.</div>
    </footer>
  </main>
</body>
</html>`;

await writeFile(output, html, "utf8");
console.log(`Wrote ${output}`);
