<p align="center">
  <a href="https://paperear.app"><img src="docs/banner.svg" alt="Paperear. Step into the page. It answers your touch." width="100%"></a>
</p>

<p align="center">
  <a href="https://paperear.app"><img alt="Live at paperear.app" src="https://img.shields.io/badge/Live-paperear.app-2563C7?style=flat&labelColor=16212E"></a>
  <img alt="Free forever for personal use" src="https://img.shields.io/badge/Personal%20use-free%20forever-3D95A8?style=flat&labelColor=16212E">
  <img alt="No account needed" src="https://img.shields.io/badge/Account-none%20needed-3D95A8?style=flat&labelColor=16212E">
  <a href="LICENSE"><img alt="Licence AGPL-3.0-only" src="https://img.shields.io/badge/Licence-AGPL--3.0--only-2563C7?style=flat&labelColor=16212E"></a>
  <a href="src/content/welcome.en.md"><img alt="Guide in English" src="https://img.shields.io/badge/Guide-English-2563C7?style=flat&labelColor=16212E"></a>
  <a href="src/content/welcome.ar.md"><img alt="Guide in Arabic" src="https://img.shields.io/badge/%D8%A7%D9%84%D8%AF%D9%84%D9%8A%D9%84-%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9-2563C7?style=flat&labelColor=16212E"></a>
</p>

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white&labelColor=20232A">
  <img alt="Vite 7" src="https://img.shields.io/badge/Vite-7-646CFF?style=flat&logo=vite&logoColor=white&labelColor=20232A">
  <img alt="PDF.js" src="https://img.shields.io/badge/PDF.js-5-E66000?style=flat&logo=mozilla&logoColor=white&labelColor=20232A">
  <img alt="Tesseract.js" src="https://img.shields.io/badge/Tesseract.js-7-3D95A8?style=flat&labelColor=20232A">
  <img alt="Piper voices" src="https://img.shields.io/badge/Voices-Piper-2563C7?style=flat&labelColor=20232A">
  <img alt="ONNX Runtime Web" src="https://img.shields.io/badge/ONNX%20Runtime-Web-005CED?style=flat&logo=onnx&logoColor=white&labelColor=20232A">
</p>

<p align="center">
  <a href="https://paperear.app"><strong>Start reading</strong></a>
  ·
  <a href="VOICES.md">Voices</a>
  ·
  <a href="CONTRIBUTING.md">Contributing</a>
  ·
  <a href="SECURITY.md">Security</a>
</p>

## Why Paperear

Some pages are easier to hear than to read. Paperear reads your document aloud, one word at a time, and lights up each word on the original page as it goes. Your eyes and your ears take in the same word together, and the page pulls you in.

What sets it apart is that the text itself is interactive. Most tools read at you from top to bottom. With Paperear you travel through the page yourself, with the commands you already know:

- Click any word, and the voice starts right there.
- Space pauses and picks up again. The arrows step one word at a time; Ctrl with an arrow jumps a paragraph.
- Up and down set the pace, and the light keeps step at every speed.
- Go back to hear a line again, skip what you know, or stay exactly where you are.

The voice and the lit word follow each move the moment you make it. On phones and tablets, touch controls made for the same journey are on the way.

You keep your place, your layout and your pace. It runs in your browser, it is free for personal use, and there is nothing to sign up for.

## What it does

- Reads PDFs, EPUB, DOCX, Markdown and typed text aloud, word by word.
- Highlights each word on the original page as it is spoken.
- Recognises scanned PDFs on your device, so pages that are only images can be read too.
- Detects the language of each page, so it can be read in a matching voice.
- Lets you move through the text while it reads: start from any word, step by word or paragraph, change the pace, all from the keyboard.
- Gives you free voices for many languages, your device's own voices, or a voice provider through your own key (ElevenLabs today).
- Takes word reports. When a word is read wrong, you can report it. Once it is fixed, it is fixed for everyone.

## Privacy

Your documents stay on your device. They are opened, recognised and read inside your browser, and they are never uploaded. There are no accounts.

What does leave your device:

- The text being read, sent with your key to the voice provider you chose, only when you use a provider voice. The key is stored encrypted on your device and goes nowhere else.
- A word report or a licence request, only when you send one.
- Page visits, counted by Umami without cookies.

Free voices come from Hugging Face and fonts from Google Fonts, so those services see your browser ask for them, as with any website.

## Voices

Free voices download once and then run on your device. Your device's own voices work with no download at all. If you have a key from a voice provider, its voices appear next to the others.

How the free voices are chosen is in [VOICES.md](VOICES.md). Each voice, with its language and licence, is listed in `src/data/openVoices.js` and shown next to the voice in the app.

## Run it yourself

You need npm and Node.js 20.19 or newer on the 20 line, or 22.12 or newer.

```sh
npm install
npm run dev
```

For a production build:

```sh
npm run build
```

This repository ships a plain stand-in reading engine, so the app builds and reads text as written. The reading engine used at paperear.app, the rules that decide how each word is read, is not part of this repository.

Built with React, Vite, pdf.js, tesseract.js, and Piper voices through ONNX Runtime Web.

## Licence

Copyright (C) 2026 Adham Saeed Aly. The code in this repository is licensed under the GNU Affero General Public License, version 3 only ([AGPL-3.0-only](LICENSE)). Parts made by others keep their own licences, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Using the app at [paperear.app](https://paperear.app) is free for personal use, forever. Work use needs a yearly licence for each person; see the [Pricing page](https://paperear.app/pricing).

## Contributing

Issues are welcome: bugs, words read wrong, ideas. Code contributions need the contributor agreement before they can be merged. [CONTRIBUTING.md](CONTRIBUTING.md) explains how.

## Contact

[hello@paperear.app](mailto:hello@paperear.app)
