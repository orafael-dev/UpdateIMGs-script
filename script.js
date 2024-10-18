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
      LIMIT 5      
      `);

    const uenoGamesWithoutThumbnail = res.rows;

    console.log(
      `Total: ${uenoGamesWithoutThumbnail.length} Jogos sem capa:`,
      uenoGamesWithoutThumbnail
    );

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
    console.log(game.thumbnail_url);
    return game.thumbnail_url;
  } catch (err) {
    console.error("Erro ao buscar capas:", err);
  } finally {
    // await giroWinClient.end();
  }
}

async function downloadImg(url, filepath) {
  const writer = fs.createWriteStream(filepath);
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function sendImageToUenobetDB(gameId) {
  try {
    const imagePath = path.join(__dirname, "temp", "teste.jpg");

    if (!imagePath) {
      throw new Error("Imagem não encontrada");
    }

    const imageStream = fs.createReadStream(imagePath);
    // console.log("Stream da imagem criado:", imageStream);

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

async function updateUenobetImgs() {
  const uenoGames = await getUenoGamesWithoutImg();
  const gamesWithThumbnails = [];
  await giroWinClient.connect();

  try {
    for (const game of uenoGames) {
      const thumbnailUrl = await getGiroWinGamesImg(game.game_name);

      if (thumbnailUrl) {
        gamesWithThumbnails.push({
          name: game.game_name,
          thumbnail_url: thumbnailUrl,
          id: game.id,
        });
      } else {
        console.log("Capa não encontrada para o jogo:", game.game_name);
      }
    }
    console.log("Jogos e capas encontradas:", gamesWithThumbnails);
    return gamesWithThumbnails;
  } catch (error) {
  } finally {
    await giroWinClient.end();
  }
}

// getUenoGamesWithoutImg();
// getGiroWinGamesImgUrl("Bonanza");
// updateUenobetImgs();

// const filePath = path.join(__dirname, 'temp', 'teste.jpg');
// downloadImg()
const testId = "ef42af47-2779-4903-a6fb-cc9da779c97b";

sendImageToUenobetDB(testId);
