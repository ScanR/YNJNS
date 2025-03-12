const fs = require("fs");
const { parse } = require("node-html-parser");
const Canvas = require("@napi-rs/canvas");
const rl = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl._writeToOutput = function _writeToOutput(stringToWrite) {
  if (!rl.stdoutMuted) rl.output.write(stringToWrite);
  else rl.output.write("\x1B[2K\x1B[200DEntrez votre mot de passe : ");
};

const scrappingSeries = {
  uma: "『ウマ娘 シンデレラグレイ』／漫画：久住太陽　脚本：杉浦理史＆Pita　漫画企画構成：伊藤隼之介（原作：Cygames）",
};

const path = "./series";

const numberFormat = new Intl.NumberFormat("fr-FR", {
  minimumIntegerDigits: 2,
});
const f = numberFormat.format;

let cid;
let Cookie;

rl.stdoutMuted = false;
if (!fs.existsSync("./config.json")) {
  rl.question("Entrez votre email : ", (email) => {
    rl.stdoutMuted = true;
    rl.question("Entrez votre mot de passe : ", (password) => {
      const config = { email: email, password: password };
      fs.writeFileSync("./config.json", JSON.stringify(config));
      rl.stdoutMuted = false;
      rl.question("Entrez l'id (dernier jump par défaut) : ", (id) => {
        cid = id;
        main();
        rl.close();
      });
    });
  });
} else {
  rl.question("Entrez l'id (dernier jump par défaut) : ", (id) => {
    cid = id;
    main();
    rl.close();
  });
}

const main = async () => {
  if (!(await getGlobalCookie())) return;

  if (!fs.existsSync(path)) fs.mkdirSync(path);

  const id = cid ? cid : await getId();
  const magazine = await fetch(
    `https://webapi.ynjn.jp/viewer/comic/${id}?isHighResolution=1`,
    {
      headers: { Cookie: Cookie },
    }
  ).then((res) => res.json());

  const pages = magazine.data.pages;
  const series = magazine.data.toc;
  Object.entries(scrappingSeries).forEach(async ([index, value]) => {
    const serie = series.filter((a) => a.name == value)[0];
    if (!serie) return console.log(`Pas de ${index} cette semaine`);
    const start = serie.page;
    const seriesAfter = series.at(series.indexOf(serie) + 1);
    const end = seriesAfter ? seriesAfter.page : pages.length - 1;
    const pagesSerie = pages.slice(start - 1, end - 1);

    const folderSeries = `./${path}/${index}`;
    if (!fs.existsSync(folderSeries)) fs.mkdirSync(folderSeries);
    const name = magazine.data.viewer_navigation.name.split(" ");
    name.shift();
    const folder = `${folderSeries}/${name.join("-")}`;
    if (fs.existsSync(folder)) return console.log(`${index} déjà dl`);
    fs.mkdirSync(folder);
    const download = downloader(folder);
    await Promise.all(pagesSerie.map(download));
    console.log(`${index} end`);
  });
};

const getId = async () => {
  const contentUrl = `https://webapi.ynjn.jp/membership/issues?sort=2&page=1`;
  const json = await fetch(contentUrl, { headers: { Cookie: Cookie } }).then(
    (res) => res.json()
  );
  return json.data.issues[0].comic_id;
};

const downloader = (folder) => {
  return async (value, index) => {
    const image = await unscrap(value.manga_page.page_image_url);
    fs.writeFileSync(`${folder}/${f(index + 1)}.jpg`, image);
  };
};

const unscrap = async (url) => {
  const image = await Canvas.loadImage(url);
  const height = image.height;
  const width = image.width;
  const final = new Canvas.Canvas(width, height);
  const context = final.getContext("2d");

  let largeur_piece = 337;
  const hauteur_piece = 480;

  const pieces = getCoordPieces(width, largeur_piece);

  const ordre_indices = [
    0, 5, 10, 15, 4, 1, 6, 11, 16, 9, 2, 7, 12, 17, 14, 3, 8, 13, 18, 19,
  ];

  ordre_indices.forEach((indice_partie, index) => {
    const src = pieces[indice_partie];
    const x = (index % 5) * largeur_piece;
    const y = Math.floor(index / 5) * hauteur_piece;
    context.drawImage(image, src.x, src.y, src.w, src.h, x, y, src.w, src.h);
  });

  return await final.encode("jpeg");
};

const getCoordPieces = (width, largeur_piece) => {
  const largeur_colonnes = [
    largeur_piece,
    largeur_piece,
    largeur_piece,
    largeur_piece,
    width - largeur_piece * 4,
  ];
  const hauteur_lignes = 480;
  const pieces = [];
  for (ligne = 0; ligne < 4; ligne++) {
    for (colonne = 0; colonne < 5; colonne++) {
      const x = sum(largeur_colonnes.slice(0, colonne));
      const y = ligne * hauteur_lignes;
      const w = largeur_colonnes[colonne];
      const h = hauteur_lignes;
      pieces.push({
        x: x,
        y: y,
        w: w,
        h: h,
      });
    }
  }
  return pieces;
};

const sum = (array) => array.reduce((acc, value) => acc + value, 0);

const getGlobalCookie = async () => {
  let cookieFile;
  let isExpire = false;
  let cookie;
  if (fs.existsSync("./cookie.json")) {
    cookieFile = fs.readFileSync("./cookie.json");
    try {
      const cookieJson = JSON.parse(cookieFile);
      new Date(cookieJson.expire);
      const expire = cookieJson.expire;
      if (new Date().getTime() >= expire) isExpire = true;
      else cookie = cookieJson;
    } catch {
      isExpire = true;
    }
  }
  if (!cookieFile || isExpire) {
    let config;
    configFile = fs.readFileSync("./config.json");
    try {
      config = JSON.parse(configFile);
      if (!config.email || !config.password) {
        console.log(
          "Le fichier config.json est incorrect, veuillez recommencer"
        );
        fs.rmSync("./config.json");
        return false;
      }
    } catch {
      console.log(
        "Le fichier de config.json est incorrect, veuillez recommencer"
      );
      fs.rmSync("./config.json");
      return false;
    }
    const body = {
      email: config.email,
      password: config.password,
    };
    try {
      const res = await fetch("https://webapi.ynjn.jp/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((res) => res);
      const cookieGlobal = res.headers.getSetCookie()[0].split("; ");
      const expire = new Date(cookieGlobal[3].slice(8)).getTime();
      cookie = {
        cookie: cookieGlobal[0],
        expire: expire,
      };
      fs.writeFileSync("./cookie.json", JSON.stringify(cookie));
    } catch (e) {
      console.log(
        "Les informations de connection sont erronnés, veuillez recommencer"
      );
      console.log(e);
      fs.rmSync("./config.json");
      return false;
    }
  }
  Cookie = cookie.cookie;
  return true;
};
