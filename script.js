require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const {Client} = require("pg");
const FormData = require("form-data");

const uenoClient = new Client({
  connectionString: process.env.UENOBET_DB_URL,
});

const giroWinClient = new Client({
  connectionString: process.env.GIROWIN_DB_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function getUenoGamesWithoutImg() {
  try {
    await uenoClient.connect();

    const res = await uenoClient.query(`
      SELECT 
      games.id, 
      games.name AS game_name, 
      game_providers.name AS provider_name
      FROM games
      INNER JOIN game_providers ON game_providers.id = games.provider_id
      WHERE games.thumbnail_url IS NULL
      AND game_providers.name IN ('EVOLUTION')   
      `);

    const uenoGamesWithoutThumbnail = res.rows;

    // console.log(
    //   `Total: ${uenoGamesWithoutThumbnail.length} Jogos sem capa:`,
    //   uenoGamesWithoutThumbnail
    // );

    return uenoGamesWithoutThumbnail;
  } catch (err) {
    console.error("Erro ao buscar jogos sem imagem:", err);
  } finally {
  }
  await uenoClient.end();
}

async function getGiroWinGamesImgUrl(gameName) {
  try {
    // await giroWinClient.connect();
    const res = await giroWinClient.query(
      `
      SELECT thumbnail_url
      FROM games
      WHERE name = $1
      `,
      [gameName]
    );

    const [game] = res.rows;
    // console.log(game.thumbnail_url);
    const gameUrl = game.thumbnail_url;
    return gameUrl;
  } catch (err) {
    // console.error("Erro ao buscar capas:", err);
  } finally {
    // await giroWinClient.end();
  }
}

async function downloadImg(url, filepath) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  const contentType = response.headers["content-type"];
  const extension = contentType.split("/")[1];
  const filepathWithExtension = `${filepath}.${extension}`;

  const writer = fs.createWriteStream(filepathWithExtension);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => {
      resolve(extension);
    });
    writer.on("error", reject);
  });
}

async function sendImageToUenobetDB(gameId, filename) {
  try {
    const imagePath = path.join(__dirname, "temp", filename);

    if (!imagePath) {
      throw new Error("Imagem não encontrada");
    }

    const imageStream = fs.createReadStream(imagePath);

    const form = new FormData();
    form.append("file", imageStream);

    const headers = {
      ...form.getHeaders(),
      Authorization: `Bearer ${process.env.UENOBET_ACCESS_TOKEN}`,
      "x-fingerprint": process.env.UENOBET_FINGERPRINT,
    };

    const response = await axios.patch(
      `https://api-dash-stage.uenobet.com/games/${gameId}`,
      form,
      {
        headers: headers,
      }
    );

    console.log("Imagem enviada com sucesso:", response.data);
  } catch (error) {
    console.error("Erro ao enviar a imagem:", error.message);
  }
}

async function Sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function UpdateUenobetImgs() {
  const startTimer = performance.now();
  const uenoGames = await getUenoGamesWithoutImg();
  const gamesWithThumbnails = [];
  await giroWinClient.connect();

  try {
    for (const game of uenoGames) {
      const thumbnailUrl = await getGiroWinGamesImgUrl(game.game_name);
      const gameNameFormated = game.game_name.split(" ").join("_");

      if (!thumbnailUrl) {
        console.log(`❌ Capa não encontrada para o jogo: ${game.game_name}`);
        continue;
      }
      gamesWithThumbnails.push({
        name: game.game_name,
      });

      await getGiroWinGamesImgUrl(game.game_name);

      const extension = await downloadImg(
        thumbnailUrl,
        path.join(__dirname, "temp", gameNameFormated)
      );

      await sendImageToUenobetDB(game.id, `${gameNameFormated}.${extension}`);

      await Sleep(350);

      fs.unlinkSync(
        path.join(__dirname, "temp", `${gameNameFormated}.${extension}`)
      );

      console.log(`✅ ${game.game_name} atualizado com sucesso!`);
    }

    const endTimer = performance.now();
    const duration = endTimer - startTimer;

    console.table([
      {
        "Total de Jogos": uenoGames.length,
        "✅ Jogos Atualizados": gamesWithThumbnails.length,
        "❌ Jogos sem URL": uenoGames.length - gamesWithThumbnails.length,
        "Total de Jogos Atualizados": `${gamesWithThumbnails.length} de ${uenoGames.length}`,
        "Tempo de execução do script": `${(duration / 1000).toFixed(2)}s`,
      },
    ]);

    console.log("Capas atualizadas:", gamesWithThumbnails);
    return gamesWithThumbnails;
  } catch (error) {
  } finally {
    await giroWinClient.end();
  }
}

UpdateUenobetImgs();
// sendImageToUenobetDB("53fb2274-cc77-4ea4-8245-f3dbcbb50452", "Crazy_Time.webp");
