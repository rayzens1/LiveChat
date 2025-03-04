const express = require('express');
const multer  = require('multer');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const port = 3001;
require('dotenv').config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  REST, 
  Routes,
  MessageFlags
} = require('discord.js');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { Readable } = require('stream');
const streamPipeline = promisify(pipeline);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Définition de la commande slash /video
const commands = [
  new SlashCommandBuilder()
    .setName('video')
    .setDescription('Télécharge une vidéo attachée et la renomme avec un timestamp')
    .addAttachmentOption(option =>
      option.setName('fichier')
        .setDescription('La vidéo à télécharger')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Texte à afficher en bas de la vidéo')
        .setRequired(false)
    )
    .toJSON()
];

// Enregistrement des commandes slash auprès de Discord
const rest = new REST({ version: '10' }).setToken(token);
(async () => {
  try {
    console.log('Enregistrement des commandes slash...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('Commandes enregistrées avec succès.');
  } catch (error) {
    console.error(error);
  }
})();

client.once('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

// Gestion de la commande /video
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  
  if (interaction.commandName === 'video') {
    // Récupération de l'attachement
    const attachment = interaction.options.getAttachment('fichier');
    if (!attachment) {
      await interaction.reply({ 
        content: "Veuillez attacher une vidéo.", 
        flags: MessageFlags.EPHEMERAL 
      });
      return;
    }
    
    const videoUrl = attachment.url;
    const videoDescription = interaction.options.getString('description') || '';
    
    // Création d'un nom de fichier basé sur le timestamp actuel
    const timestamp = new Date().getTime();
    const ext = path.extname(attachment.name) || '.mp4';

    if(ext !== '.mp4' && ext !== '.mov' && ext !== '.avi' && ext !== '.mkv' && ext !== '.webm') {
      await interaction.reply({ 
        content: "Veuillez attacher une vidéo au format mp4.", 
        flags: MessageFlags.EPHEMERAL 
      });
      return;
    }

    const filename = `${timestamp}${ext}`;
    const downloadPath = path.join(__dirname, 'uploads');
    
    // Création du dossier 'downloads' s'il n'existe pas
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }
    
    const filePath = path.join(downloadPath, filename);
    
    try {
      const response = await fetch(videoUrl); // API fetch native de Node.js
      if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
      
      // Convertir le WHATWG ReadableStream en Node.js stream
      const nodeStream = Readable.fromWeb(response.body);
      await streamPipeline(nodeStream, fs.createWriteStream(filePath));

      console.log("EMITTING NEW VIDEO");

      // Envoi la vidéo dans la socket newVideo au html
      if(videoDescription !== '') {
        io.emit('newVideo', { filename, text: videoDescription });
      } else {
        io.emit('newVideo', { filename });
      }
      
      await interaction.reply(`Vidéo téléchargée avec succès et renommée en : \`${filename}\``);
    } catch (err) {
      console.error('Erreur lors du téléchargement :', err);
      await interaction.reply({ 
        content: "Une erreur s'est produite lors du téléchargement de la vidéo.", 
        flags: MessageFlags.EPHEMERAL 
      });
    }
  }
});

client.login(token);


// Configuration de Multer pour sauvegarder les vidéos dans le dossier 'uploads'
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // On ajoute un timestamp pour éviter les conflits de noms
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Dossier pour les vidéos téléchargées
const downloadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Servir les fichiers statiques (page HTML, CSS, etc.)
app.use('/uploads', express.static(downloadsDir));
app.use(express.static('public'));

// Route pour uploader la vidéo
app.post('/upload', upload.single('video'), (req, res) => {
  const videoFile = req.file.filename;
  // Redirige vers une page qui lira automatiquement la vidéo
  //res.redirect('/video/' + videoFile);
});

// Route pour la page livechat
app.get('/livechat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'livechat.html'));
}); 

// Route pour afficher et lire la vidéo
app.get('/video/:filename', (req, res) => {
  const videoFile = req.params.filename;
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Lecture vidéo</title>
      <style>
        /* Pour que la vidéo occupe toute la fenêtre */
        html, body {
          margin: 0;
          padding: 0;
          height: 100%;
        }
        video {
          width: 100%;
          height: 100%;
          object-fit: cover; /* Ajuste le contenu pour couvrir l'espace sans déformer */
        }
      </style>
    </head>
    <body>
      <video id="videoPlayer" autoplay controls>
        <source src="/uploads/${videoFile}" type="video/mp4">
        Votre navigateur ne supporte pas la lecture vidéo.
      </video>
      <script>
        // Lorsque la vidéo est terminée, l'élément est retiré du DOM
        const video = document.getElementById('videoPlayer');
        video.addEventListener('ended', function() {
          video.remove();
        });
      </script>
    </body>
    </html>
  `);
});

httpServer.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});