require("dotenv").config();
const {Client} = require("pg");

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

async function getGiroWinGamesImg(gameName) {
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
    // console.log(game[0].thumbnail_url);

    return game.thumbnail_url;
  } catch (err) {
    console.error("Erro ao buscar capas:", err);
  } finally {
  }
  await giroWinClient.end();
}

async function matchGamesWithImg() {
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
// getGiroWinGamesImg("Bonanza");
matchGamesWithImg();
